import type { Logger } from 'winston';
import type { NFCEvent, MockAdapterOptions, USBAdapterConfig } from '@kioskos/shared-types';
import { NFCAdapter } from './NFCAdapter';

const DEFAULT_INTERVAL_MS = 15000;

export interface MockNFCConfig extends USBAdapterConfig {
  mockOptions?: MockAdapterOptions;
}

export class MockNFCAdapter extends NFCAdapter {
  readonly manufacturer = 'Mock';
  readonly model = 'MockNFC';
  readonly deviceId: string;

  private interval: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private polling = false;

  constructor(deviceId: string, logger: Logger) {
    super(logger);
    this.deviceId = deviceId;
    this.intervalMs = DEFAULT_INTERVAL_MS;
  }

  async connect(config: MockNFCConfig): Promise<void> {
    this.setConnectionState('connecting');
    this.intervalMs = config.mockOptions?.simulationIntervalMs ?? DEFAULT_INTERVAL_MS;

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    this.setConnectionState('connected');
    this.logger.info('Mock NFC reader connected', { deviceId: this.deviceId });
  }

  async disconnect(): Promise<void> {
    await this.stopPolling();
    this.setConnectionState('disconnected');
  }

  async startPolling(): Promise<void> {
    this.polling = true;
    this.stopInterval();
    this.interval = setInterval(() => {
      if (!this.polling) return;
      this.simulateNFCRead();
    }, this.intervalMs);
    this.logger.info('Mock NFC polling started', { deviceId: this.deviceId });
  }

  async stopPolling(): Promise<void> {
    this.polling = false;
    this.stopInterval();
    this.logger.info('Mock NFC polling stopped', { deviceId: this.deviceId });
  }

  private stopInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private generateUID(): string {
    return Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0'),
    )
      .join(':')
      .toUpperCase();
  }

  private simulateNFCRead(): void {
    const uid = this.generateUID();
    const readEvent: NFCEvent = {
      type: 'read',
      uid,
      data: null,
      deviceId: this.deviceId,
      timestamp: new Date().toISOString(),
    };
    this.emit('nfc:read', readEvent);

    // Simulate card removal after 2 seconds
    setTimeout(() => {
      const removeEvent: NFCEvent = {
        type: 'removed',
        uid,
        data: null,
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
      };
      this.emit('nfc:removed', removeEvent);
    }, 2000);
  }
}
