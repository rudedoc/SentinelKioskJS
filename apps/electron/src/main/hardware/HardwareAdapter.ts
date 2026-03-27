import { EventEmitter } from 'events';
import type { Logger } from 'winston';
import type {
  HardwareCategory,
  HardwareConnectionState,
  HardwareStatus,
} from '@kioskos/shared-types';
import { HardwareError } from '@kioskos/shared-types';

export abstract class HardwareAdapter<TConfig = unknown> extends EventEmitter {
  abstract readonly category: HardwareCategory;
  abstract readonly manufacturer: string;
  abstract readonly model: string;
  abstract readonly deviceId: string;

  protected connectionState: HardwareConnectionState = 'disconnected';

  constructor(protected readonly logger: Logger) {
    super();
  }

  abstract connect(config: TConfig): Promise<void>;
  abstract disconnect(): Promise<void>;

  getStatus(): HardwareStatus {
    return {
      category: this.category,
      deviceId: this.deviceId,
      manufacturer: this.manufacturer,
      model: this.model,
      connectionState: this.connectionState,
      lastSeen: this.connectionState === 'connected' ? new Date().toISOString() : null,
      errorMessage: null,
      metadata: {},
    };
  }

  getConnectionState(): HardwareConnectionState {
    return this.connectionState;
  }

  protected setConnectionState(state: HardwareConnectionState): void {
    const previous = this.connectionState;
    this.connectionState = state;
    if (previous !== state) {
      this.emit('state-change', { previous, current: state, deviceId: this.deviceId });
      this.logger.info('Connection state changed', {
        deviceId: this.deviceId,
        previous,
        current: state,
      });
    }
  }

  protected emitError(error: HardwareError): void {
    this.setConnectionState('error');
    this.emit('error', error);
    this.logger.error('Hardware error', {
      deviceId: this.deviceId,
      code: error.code,
      message: error.message,
    });
  }

  onError?(error: Error): void;
  onReconnect?(): Promise<void>;
}
