import { EventEmitter } from 'events';
import type { Logger } from 'winston';
import type { HardwareCategory, HardwareHealthReport } from '@kioskos/shared-types';
import { HardwareError, HardwareErrorCode } from '@kioskos/shared-types';
import type { HardwareEventRepo } from '../db/repositories/HardwareEventRepo';
import { HardwareAdapter } from './HardwareAdapter';

const FORWARDED_EVENTS = [
  'bill:inserted',
  'bill:stacked',
  'bill:rejected',
  'bill:returned',
  'coin:inserted',
  'coin:rejected',
  'nfc:read',
  'nfc:removed',
  'barcode:scanned',
];

export class HardwareManager extends EventEmitter {
  private adapters: Map<string, HardwareAdapter> = new Map();

  constructor(
    private readonly logger: Logger,
    private readonly hardwareEventRepo: HardwareEventRepo,
  ) {
    super();
  }

  register(id: string, adapter: HardwareAdapter): void {
    if (this.adapters.has(id)) {
      throw new HardwareError(
        `Adapter already registered: ${id}`,
        HardwareErrorCode.DEVICE_BUSY,
        id,
        adapter.category,
      );
    }

    this.adapters.set(id, adapter);
    this.bindAdapterEvents(id, adapter);
    this.logger.info('Adapter registered', {
      id,
      category: adapter.category,
      manufacturer: adapter.manufacturer,
      model: adapter.model,
    });
  }

  async unregister(id: string): Promise<void> {
    const adapter = this.adapters.get(id);
    if (!adapter) return;

    try {
      await adapter.disconnect();
    } catch (err) {
      this.logger.warn('Error disconnecting adapter during unregister', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    adapter.removeAllListeners();
    this.adapters.delete(id);
    this.logger.info('Adapter unregistered', { id });
  }

  getAdapter<T extends HardwareAdapter>(id: string): T {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new HardwareError(
        `Adapter not found: ${id}`,
        HardwareErrorCode.UNKNOWN_DEVICE,
        id,
        'unknown',
      );
    }
    return adapter as T;
  }

  getByCategory(category: HardwareCategory): HardwareAdapter[] {
    return Array.from(this.adapters.values()).filter((a) => a.category === category);
  }

  getAllAdapters(): Map<string, HardwareAdapter> {
    return this.adapters;
  }

  async connectAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([id, adapter]) => {
        try {
          this.logger.info('Connecting adapter', { id, category: adapter.category });
          // Config is already set during adapter creation — connect uses stored config
          // For adapters that need config passed to connect(), it should be done before registration
        } catch (err) {
          this.logger.error('Failed to connect adapter', {
            id,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length} adapter(s) failed to connect`);
    }
  }

  async disconnectAll(): Promise<void> {
    const entries = Array.from(this.adapters.entries());
    await Promise.allSettled(
      entries.map(async ([id, adapter]) => {
        try {
          await adapter.disconnect();
          this.logger.info('Adapter disconnected', { id });
        } catch (err) {
          this.logger.warn('Error disconnecting adapter', {
            id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  healthCheck(): HardwareHealthReport {
    const devices = Array.from(this.adapters.values()).map((a) => a.getStatus());
    const overallHealthy = devices.every((d) => d.connectionState === 'connected');

    return {
      timestamp: new Date().toISOString(),
      devices,
      overallHealthy,
    };
  }

  private bindAdapterEvents(id: string, adapter: HardwareAdapter): void {
    // Forward domain events (bill, coin, nfc, barcode) to manager listeners
    for (const event of FORWARDED_EVENTS) {
      adapter.on(event, (...args: unknown[]) => {
        this.emit(event, ...args);
      });
    }

    // Persist state changes as hardware events
    adapter.on('state-change', ({ previous, current }) => {
      this.hardwareEventRepo.create({
        deviceCategory: adapter.category,
        deviceId: id,
        eventType: 'state_change',
        severity: current === 'error' ? 'error' : 'info',
        payload: { previous, current },
      });
    });

    // Persist and forward errors
    adapter.on('error', (error: HardwareError) => {
      this.hardwareEventRepo.create({
        deviceCategory: adapter.category,
        deviceId: id,
        eventType: 'error',
        severity: 'error',
        payload: { code: error.code, message: error.message },
      });
      this.emit('adapter-error', { id, error });
    });
  }
}
