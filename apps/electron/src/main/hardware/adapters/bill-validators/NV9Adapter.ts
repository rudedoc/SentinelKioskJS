import type { Logger } from 'winston';
import type { SerialAdapterConfig, BillValidatorState, BillEvent } from '@kioskos/shared-types';
import { HardwareError, HardwareErrorCode } from '@kioskos/shared-types';
import { BillValidatorAdapter } from './BillValidatorAdapter';
import { NV9BillValidator, NV9Options, NV9State } from './NV9BillValidator';

export interface NV9AdapterConfig extends SerialAdapterConfig {
  channelValues: Record<number, number>;
  currency?: string;
  escrow?: boolean;
  useEncryption?: boolean;
  fixedKey?: string;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export class NV9Adapter extends BillValidatorAdapter {
  readonly manufacturer = 'Innovative Technology';
  readonly model = 'NV9';
  readonly deviceId: string;

  private nv9: NV9BillValidator | null = null;
  private config: NV9AdapterConfig | null = null;
  private currency: string;

  constructor(deviceId: string, logger: Logger) {
    super(logger);
    this.deviceId = deviceId;
    this.currency = 'EUR';
  }

  async connect(config: NV9AdapterConfig): Promise<void> {
    if (this.nv9) {
      throw new HardwareError(
        'Already connected',
        HardwareErrorCode.DEVICE_BUSY,
        this.deviceId,
        this.category,
      );
    }

    this.config = config;
    this.currency = config.currency ?? 'EUR';
    this.setConnectionState('connecting');

    const nv9Options: NV9Options = {
      port: config.port,
      channelValues: config.channelValues,
      escrow: config.escrow ?? false,
      useEncryption: config.useEncryption ?? false,
      ...(config.fixedKey !== undefined && { fixedKey: config.fixedKey }),
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 3000,
    };

    this.nv9 = new NV9BillValidator(nv9Options);
    this.bindNV9Events(this.nv9);

    try {
      this.nv9.connect();
    } catch (err) {
      this.nv9 = null;
      this.emitError(
        new HardwareError(
          `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
          HardwareErrorCode.CONNECTION_FAILED,
          this.deviceId,
          this.category,
        ),
      );
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.nv9) {
      await this.nv9.disconnect();
      this.nv9 = null;
    }
    this.setConnectionState('disconnected');
  }

  async enable(): Promise<void> {
    this.ensureConnected();
    // The NV9 is enabled during initialization.
    // If it was disabled via the adapter, we need to recover it.
    if (this.nv9!.state.status === 'disabled') {
      await this.nv9!.recover();
    }
  }

  async disable(): Promise<void> {
    this.ensureConnected();
    // Disconnect and reconnect puts it in a disabled state,
    // but for a soft disable we can use the SSP DISABLE command
    // through the underlying eSSP instance. For now, disconnect fully.
    await this.nv9!.disconnect();
    // Reconnect but don't enable
    this.logger.info('NV9 disabled', { deviceId: this.deviceId });
  }

  async returnBill(): Promise<void> {
    this.ensureConnected();
    if (this.nv9!.state.noteHeld) {
      await this.nv9!.rejectNote();
    }
  }

  getValidatorState(): BillValidatorState {
    if (!this.nv9) return 'disabled';

    const state = this.nv9.state;
    switch (state.status) {
      case 'enabled':
        if (state.noteHeld) return 'escrowed';
        if (state.jammed) return 'error';
        return 'accepting';
      case 'disabled':
        return 'disabled';
      case 'connecting':
        return 'idle';
      case 'disconnected':
        return 'disabled';
      case 'error':
        return 'error';
      default:
        return 'idle';
    }
  }

  /** Accept a note currently held in escrow (escrow mode only). */
  acceptNote(): void {
    if (this.nv9) {
      this.nv9.acceptNote();
    }
  }

  /** Reject a note currently held in escrow (escrow mode only). */
  async rejectNote(): Promise<void> {
    if (this.nv9) {
      await this.nv9.rejectNote();
    }
  }

  private ensureConnected(): void {
    if (!this.nv9) {
      throw new HardwareError(
        'Not connected',
        HardwareErrorCode.NOT_INITIALIZED,
        this.deviceId,
        this.category,
      );
    }
  }

  private createBillEvent(type: BillEvent['type'], channel: number, value: number): BillEvent {
    return {
      type,
      amountCents: value * 100,
      currency: this.currency,
      deviceId: this.deviceId,
      timestamp: new Date().toISOString(),
    };
  }

  private bindNV9Events(nv9: NV9BillValidator): void {
    nv9.on('ready', () => {
      this.setConnectionState('connected');
      this.logger.info('NV9 ready', {
        deviceId: this.deviceId,
        serial: nv9.state.serialNumber,
      });
    });

    nv9.on('escrow', ({ channel, value }) => {
      this.logger.info('Bill inserted', {
        deviceId: this.deviceId,
        channel,
        value,
      });
      this.emit('bill:inserted', this.createBillEvent('inserted', channel, value));
    });

    nv9.on('credit', ({ channel, value }) => {
      this.logger.info('Bill stacked', {
        deviceId: this.deviceId,
        channel,
        value,
      });
      this.emit('bill:stacked', this.createBillEvent('stacked', channel, value));
    });

    nv9.on('rejected', (reason) => {
      this.logger.info('Bill rejected', {
        deviceId: this.deviceId,
        reason,
      });
      this.emit('bill:rejected', this.createBillEvent('rejected', 0, 0));
    });

    nv9.on('rejecting', () => {
      this.logger.debug('Bill returning to user', { deviceId: this.deviceId });
      this.emit('bill:returned', this.createBillEvent('returned', 0, 0));
    });

    // Device status events → hardware error emissions

    nv9.on('error', (err) => {
      this.logger.error('NV9 error', {
        deviceId: this.deviceId,
        error: err.message,
      });
      this.emitError(
        new HardwareError(
          err.message,
          HardwareErrorCode.PROTOCOL_ERROR,
          this.deviceId,
          this.category,
        ),
      );
    });

    nv9.on('cashboxRemoved', () => {
      this.logger.warn('Cashbox removed', { deviceId: this.deviceId });
      this.emitError(
        new HardwareError(
          'Cashbox removed',
          HardwareErrorCode.CASH_BOX_REMOVED,
          this.deviceId,
          this.category,
        ),
      );
    });

    nv9.on('cashboxReplaced', () => {
      this.logger.info('Cashbox replaced', { deviceId: this.deviceId });
      this.setConnectionState('connected');
    });

    nv9.on('stackerFull', () => {
      this.logger.warn('Stacker full', { deviceId: this.deviceId });
      this.emitError(
        new HardwareError(
          'Stacker full',
          HardwareErrorCode.CASH_BOX_FULL,
          this.deviceId,
          this.category,
        ),
      );
    });

    nv9.on('safeJam', () => {
      this.logger.error('Safe jam detected', { deviceId: this.deviceId });
      this.emitError(
        new HardwareError(
          'Bill jam (safe)',
          HardwareErrorCode.BILL_JAM,
          this.deviceId,
          this.category,
        ),
      );
    });

    nv9.on('unsafeJam', () => {
      this.logger.error('Unsafe jam detected', { deviceId: this.deviceId });
      this.emitError(
        new HardwareError(
          'Bill jam (unsafe)',
          HardwareErrorCode.BILL_JAM,
          this.deviceId,
          this.category,
        ),
      );
    });

    nv9.on('stateChange', (state: NV9State) => {
      this.emit('state-change', {
        previous: this.connectionState,
        current: state.status,
        deviceId: this.deviceId,
      });
    });

    nv9.on('reconnecting', (attempt, maxAttempts) => {
      this.logger.warn('NV9 reconnecting', {
        deviceId: this.deviceId,
        attempt,
        maxAttempts,
      });
      this.setConnectionState('connecting');
    });

    nv9.on('reconnected', () => {
      this.logger.info('NV9 reconnected', { deviceId: this.deviceId });
      this.setConnectionState('connected');
    });

    nv9.on('close', () => {
      if (this.connectionState !== 'disconnected') {
        this.logger.warn('NV9 serial port closed unexpectedly', {
          deviceId: this.deviceId,
        });
      }
    });
  }
}
