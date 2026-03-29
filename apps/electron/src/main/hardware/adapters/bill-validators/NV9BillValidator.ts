import { EventEmitter } from 'events';
import { SSPConnection } from './ssp/SSPConnection';
import { SSPCommand, SSPEvent, REJECT_REASONS, type SSPPollEvent } from './ssp/SSPTypes';

// ============================================================
// Types
// ============================================================

export interface NV9Options {
  /** Serial port path (e.g. "/dev/ttyUSB0" or "COM3") */
  port: string;
  /** SSP slave ID. Default: 0x00 */
  slaveId?: number;
  /** SSP protocol version. Default: 6 */
  protocolVersion?: number;
  /** Fixed encryption key (16 hex chars). Default: factory key */
  fixedKey?: string;
  /** Use eSSP encryption. Default: false (encryption not supported in custom SSP) */
  useEncryption?: boolean;
  /** Channel-to-value mapping. Keys are channel numbers, values are amounts. */
  channelValues: Record<number, number>;
  /** Currency label for logging. Default: "€" */
  currencySymbol?: string;
  /** Enable SSP debug logging. Default: false */
  debug?: boolean;
  /** Command timeout in ms. Default: 3000 */
  timeout?: number;
  /**
   * Escrow mode. When true, notes are held in escrow after identification.
   * Call acceptNote() to stack or rejectNote() to return. Notes auto-return
   * after 30 seconds if no action is taken (hardware timeout).
   * Default: false (auto-accept all notes).
   */
  escrow?: boolean;
  /** Maximum reconnection attempts on disconnect. 0 disables. Default: 10 */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in ms. Default: 3000 */
  reconnectDelay?: number;
  /** Timeout for the initialization sequence in ms. Default: 15000 */
  initTimeout?: number;
  /** Delay after RESET to allow device to reboot, in ms. Default: 3000 */
  resetDelay?: number;
}

export interface NV9NoteEvent {
  channel: number;
  value: number;
}

export type NV9Status = 'disconnected' | 'connecting' | 'enabled' | 'disabled' | 'error';

export interface NV9State {
  status: NV9Status;
  cashboxPresent: boolean;
  stackerFull: boolean;
  jammed: boolean;
  notePathOpen: boolean;
  noteHeld: boolean;
  serialNumber: string | null;
}

export interface NV9Events {
  ready: [];
  escrow: [event: NV9NoteEvent];
  credit: [event: NV9NoteEvent];
  rejecting: [];
  rejected: [reason?: Record<string, unknown>];
  stacking: [];
  stacked: [];
  cashboxRemoved: [];
  cashboxReplaced: [];
  stackerFull: [];
  safeJam: [];
  unsafeJam: [];
  fraud: [event: NV9NoteEvent];
  disabled: [];
  slaveReset: [];
  noteClearedFromFront: [event: NV9NoteEvent];
  noteClearedToCashbox: [event: NV9NoteEvent];
  notePathOpen: [];
  channelDisable: [];
  open: [];
  close: [];
  error: [error: Error];
  stateChange: [state: NV9State];
  reconnecting: [attempt: number, maxAttempts: number];
  reconnected: [];
}

// ============================================================
// Implementation
// ============================================================

const POLL_INTERVAL_MS = 100;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface NV9BillValidator {
  on<K extends keyof NV9Events>(event: K, listener: (...args: NV9Events[K]) => void): this;
  emit<K extends keyof NV9Events>(event: K, ...args: NV9Events[K]): boolean;
  off<K extends keyof NV9Events>(event: K, listener: (...args: NV9Events[K]) => void): this;
  once<K extends keyof NV9Events>(event: K, listener: (...args: NV9Events[K]) => void): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class NV9BillValidator extends EventEmitter {
  private ssp: SSPConnection | null = null;
  private running = false;
  private _status: NV9Status = 'disconnected';
  private _cashboxPresent = true;
  private _stackerFull = false;
  private _jammed = false;
  private _notePathOpen = false;
  private _noteHeld = false;
  private _serialNumber: string | null = null;
  private _reconnectAttempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _intentionalDisconnect = false;
  private _expectSlaveReset = false;
  private _holdTimer: ReturnType<typeof setInterval> | null = null;

  readonly opts: Readonly<
    Required<
      Pick<
        NV9Options,
        | 'port'
        | 'slaveId'
        | 'protocolVersion'
        | 'fixedKey'
        | 'useEncryption'
        | 'channelValues'
        | 'currencySymbol'
        | 'debug'
        | 'timeout'
        | 'escrow'
        | 'maxReconnectAttempts'
        | 'reconnectDelay'
        | 'initTimeout'
        | 'resetDelay'
      >
    >
  >;

  constructor(options: NV9Options) {
    super();
    this.opts = {
      port: options.port,
      slaveId: options.slaveId ?? 0x00,
      protocolVersion: options.protocolVersion ?? 6,
      fixedKey: options.fixedKey ?? '0123456701234567',
      useEncryption: options.useEncryption ?? false,
      channelValues: options.channelValues,
      currencySymbol: options.currencySymbol ?? '€',
      debug: options.debug ?? false,
      timeout: options.timeout ?? 3000,
      escrow: options.escrow ?? false,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectDelay: options.reconnectDelay ?? 3000,
      initTimeout: options.initTimeout ?? 15000,
      resetDelay: options.resetDelay ?? 3000,
    };
  }

  get state(): NV9State {
    return {
      status: this._status,
      cashboxPresent: this._cashboxPresent,
      stackerFull: this._stackerFull,
      jammed: this._jammed,
      notePathOpen: this._notePathOpen,
      noteHeld: this._noteHeld,
      serialNumber: this._serialNumber,
    };
  }

  connect(): void {
    if (this.ssp) {
      throw new Error('Already connected. Call disconnect() first.');
    }

    this.running = true;
    this._intentionalDisconnect = false;
    this._reconnectAttempt = 0;
    this.updateStatus('connecting');

    this.openConnection();
  }

  async disconnect(): Promise<void> {
    this._intentionalDisconnect = true;
    this.cancelReconnect();
    this.stopHoldLoop();

    if (!this.ssp || !this.running) {
      this.running = false;
      return;
    }
    this.running = false;

    try {
      this.ssp.stopPolling();
      await this.ssp.sendCommand(SSPCommand.DISABLE);
    } catch {
      // best-effort
    }

    try {
      await this.ssp.close();
    } catch {
      // best-effort
    }

    this.ssp = null;
    this._noteHeld = false;
    this.updateStatus('disconnected');
  }

  acceptNote(): void {
    if (!this._noteHeld) return;
    this.stopHoldLoop();
    this._noteHeld = false;
    this.emitStateChange();

    // Resume polling — next poll causes the device to stack the note
    if (this.ssp) {
      this.ssp.startPolling(POLL_INTERVAL_MS, (events) => this.handlePollEvents(events));
    }
  }

  async rejectNote(): Promise<void> {
    if (!this._noteHeld || !this.ssp) return;
    this.stopHoldLoop();
    this._noteHeld = false;
    this.emitStateChange();
    await this.ssp.sendCommand(SSPCommand.REJECT);

    // Resume polling
    this.ssp.startPolling(POLL_INTERVAL_MS, (events) => this.handlePollEvents(events));
  }

  async recover(): Promise<void> {
    if (!this.ssp) {
      throw new Error('Not connected. Call connect() first.');
    }

    await this.ssp.sendCommand(SSPCommand.SYNC);
    this.ssp.resetSequence();

    await this.ssp.sendCommand(
      SSPCommand.HOST_PROTOCOL_VERSION,
      Buffer.from([this.opts.protocolVersion]),
    );

    await this.ssp.sendCommand(SSPCommand.SET_INHIBITS, this.buildInhibitBytes());

    const result = await this.ssp.sendCommand(SSPCommand.ENABLE);
    if (!result.success) {
      throw new Error('Recovery failed — device did not re-enable');
    }

    this._jammed = false;
    this._stackerFull = false;
    this._notePathOpen = false;
    this._noteHeld = false;
    this.updateStatus('enabled');

    this.ssp.startPolling(POLL_INTERVAL_MS, (events) => this.handlePollEvents(events));
    this.emit('ready');
  }

  async reset(): Promise<void> {
    if (!this.ssp) {
      throw new Error('Not connected. Call connect() first.');
    }

    this.ssp.stopPolling();
    await this.ssp.sendCommand(SSPCommand.RESET);
    this._jammed = false;
    this._stackerFull = false;
    this._noteHeld = false;
    this.updateStatus('connecting');
  }

  channelValue(channel: number): number {
    return this.opts.channelValues[channel] ?? 0;
  }

  // ---- private ---------------------------------------------------

  private openConnection(): void {
    this.ssp = new SSPConnection({
      port: this.opts.port,
      address: this.opts.slaveId,
      baudRate: 9600,
      timeout: this.opts.timeout,
    });

    this.ssp.on('close', () => {
      this.updateStatus('disconnected');
      this._noteHeld = false;
      this.emit('close');

      if (this.running && !this._intentionalDisconnect && !this._reconnectTimer) {
        this.ssp = null;
        this.scheduleReconnect();
      }
    });

    this.ssp.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.ssp
      .open()
      .then(() => {
        this.emit('open');
        return this.initialize();
      })
      .catch((err: unknown) => {
        this.updateStatus('error');
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
        if (this.running && !this._intentionalDisconnect) {
          this.scheduleReconnect();
        }
      });
  }

  private cancelReconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this._intentionalDisconnect) return;
    if (this.opts.maxReconnectAttempts === 0) return;
    if (this._reconnectTimer) return;
    if (this._reconnectAttempt >= this.opts.maxReconnectAttempts) {
      this.emit(
        'error',
        new Error(`Reconnection failed after ${this.opts.maxReconnectAttempts} attempts`),
      );
      return;
    }

    this._reconnectAttempt++;
    this.emit('reconnecting', this._reconnectAttempt, this.opts.maxReconnectAttempts);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this.running || this._intentionalDisconnect) return;

      if (this.ssp) {
        const oldSSP = this.ssp;
        this.ssp = null;
        oldSSP
          .close()
          .catch(() => {})
          .finally(() => {
            setTimeout(() => {
              if (!this.running || this._intentionalDisconnect) return;
              this.attemptReconnect();
            }, 500);
          });
      } else {
        this.attemptReconnect();
      }
    }, this.opts.reconnectDelay);
  }

  private attemptReconnect(): void {
    this.updateStatus('connecting');
    try {
      this.openConnection();
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  private updateStatus(status: NV9Status): void {
    this._status = status;
    this.emitStateChange();
  }

  private emitStateChange(): void {
    this.emit('stateChange', this.state);
  }

  private updateState(patch: Partial<Omit<NV9State, 'status' | 'serialNumber'>>): void {
    let changed = false;
    if (patch.cashboxPresent !== undefined && patch.cashboxPresent !== this._cashboxPresent) {
      this._cashboxPresent = patch.cashboxPresent;
      changed = true;
    }
    if (patch.stackerFull !== undefined && patch.stackerFull !== this._stackerFull) {
      this._stackerFull = patch.stackerFull;
      changed = true;
    }
    if (patch.jammed !== undefined && patch.jammed !== this._jammed) {
      this._jammed = patch.jammed;
      changed = true;
    }
    if (patch.notePathOpen !== undefined && patch.notePathOpen !== this._notePathOpen) {
      this._notePathOpen = patch.notePathOpen;
      changed = true;
    }
    if (patch.noteHeld !== undefined && patch.noteHeld !== this._noteHeld) {
      this._noteHeld = patch.noteHeld;
      changed = true;
    }
    if (changed) {
      this.emitStateChange();
    }
  }

  /**
   * Handle events from the POLL response.
   * This replaces the old bindEvents() method — instead of 18+ eSSP event listeners,
   * we process all events in a single callback from the poll loop.
   */
  private handlePollEvents(events: SSPPollEvent[]): void {
    for (const evt of events) {
      switch (evt.code) {
        case SSPEvent.READ_NOTE: {
          if (evt.channel && evt.channel > 0 && !this._noteHeld) {
            this.emit('escrow', {
              channel: evt.channel,
              value: this.channelValue(evt.channel),
            });

            if (this.opts.escrow) {
              this._noteHeld = true;
              this.emitStateChange();
              this.startHoldLoop();
            }
          }
          break;
        }
        case SSPEvent.CREDIT_NOTE: {
          this._noteHeld = false;
          if (evt.channel) {
            this.emit('credit', {
              channel: evt.channel,
              value: this.channelValue(evt.channel),
            });
          }
          this.emitStateChange();
          break;
        }
        case SSPEvent.REJECTING: {
          this._noteHeld = false;
          this.emit('rejecting');
          this.emitStateChange();
          break;
        }
        case SSPEvent.REJECTED: {
          this._noteHeld = false;
          this.emitStateChange();
          this.queryRejectReason();
          break;
        }
        case SSPEvent.STACKING: {
          this.emit('stacking');
          break;
        }
        case SSPEvent.STACKED: {
          this._noteHeld = false;
          this.emit('stacked');
          this.emitStateChange();
          break;
        }
        case SSPEvent.DISABLED: {
          this.updateStatus('disabled');
          this.emit('disabled');
          break;
        }
        case SSPEvent.CASHBOX_REMOVED: {
          this.updateState({ cashboxPresent: false });
          this.emit('cashboxRemoved');
          break;
        }
        case SSPEvent.CASHBOX_REPLACED: {
          this.updateState({ cashboxPresent: true });
          this.emit('cashboxReplaced');
          break;
        }
        case SSPEvent.STACKER_FULL: {
          this.updateState({ stackerFull: true });
          this.emit('stackerFull');
          break;
        }
        case SSPEvent.SAFE_JAM: {
          this._noteHeld = false;
          this.updateState({ jammed: true });
          this.emit('safeJam');
          break;
        }
        case SSPEvent.UNSAFE_JAM: {
          this._noteHeld = false;
          this.updateState({ jammed: true });
          this.emit('unsafeJam');
          break;
        }
        case SSPEvent.FRAUD_ATTEMPT: {
          if (evt.channel) {
            this.emit('fraud', {
              channel: evt.channel,
              value: this.channelValue(evt.channel),
            });
          }
          break;
        }
        case SSPEvent.SLAVE_RESET: {
          this.emit('slaveReset');
          if (this._expectSlaveReset) {
            this._expectSlaveReset = false;
          } else {
            this.reinitialize().catch((err: unknown) => {
              this.updateStatus('error');
              this.emit('error', err instanceof Error ? err : new Error(String(err)));
            });
          }
          break;
        }
        case SSPEvent.NOTE_CLEARED_FROM_FRONT: {
          this._noteHeld = false;
          if (evt.channel) {
            this.emit('noteClearedFromFront', {
              channel: evt.channel,
              value: this.channelValue(evt.channel),
            });
          }
          this.emitStateChange();
          break;
        }
        case SSPEvent.NOTE_CLEARED_TO_CASHBOX: {
          this._noteHeld = false;
          if (evt.channel) {
            this.emit('noteClearedToCashbox', {
              channel: evt.channel,
              value: this.channelValue(evt.channel),
            });
          }
          this.emitStateChange();
          break;
        }
        case SSPEvent.NOTE_PATH_OPEN: {
          this.updateState({ notePathOpen: true });
          this.emit('notePathOpen');
          break;
        }
        case SSPEvent.CHANNEL_DISABLE: {
          this.emit('channelDisable');
          break;
        }
      }
    }
  }

  private async queryRejectReason(): Promise<void> {
    if (!this.ssp) return;
    try {
      const result = await this.ssp.sendCommand(SSPCommand.LAST_REJECT_CODE);
      if (result.success && result.data.length > 0) {
        const code = result.data[0]!;
        const reason = REJECT_REASONS[code] ?? `Unknown (0x${code.toString(16)})`;
        this.emit('rejected', { code, reason });
      } else {
        this.emit('rejected');
      }
    } catch {
      this.emit('rejected');
    }
  }

  private startHoldLoop(): void {
    this.stopHoldLoop();

    if (!this.ssp) return;

    // Stop polling during escrow hold to prevent command interleaving
    this.ssp.stopPolling();

    const sendHold = () => {
      if (!this._noteHeld || !this.running || !this.ssp) {
        this.stopHoldLoop();
        return;
      }
      this.ssp.sendCommand(SSPCommand.HOLD).catch(() => {
        // HOLD failed — note may auto-return after 10s
      });
    };

    sendHold();
    this._holdTimer = setInterval(sendHold, 200);
  }

  private stopHoldLoop(): void {
    if (this._holdTimer) {
      clearInterval(this._holdTimer);
      this._holdTimer = null;
    }
  }

  private buildInhibitBytes(): Buffer {
    const channelCount = Object.keys(this.opts.channelValues).length;
    const numBytes = Math.max(2, Math.ceil(channelCount / 8));
    const mask = Buffer.alloc(numBytes, 0xff);
    // Trim spare bits in final byte
    if (channelCount % 8 !== 0) {
      mask[numBytes - 1] = (1 << (channelCount % 8)) - 1;
    }
    return mask;
  }

  private async initialize(): Promise<void> {
    if (!this.ssp) throw new Error('No SSP connection');

    if (this.opts.useEncryption) {
      this.emit(
        'error',
        new Error(
          'eSSP encryption is not supported in the custom SSP implementation. Continuing without encryption.',
        ),
      );
    }

    // SYNC resets the SSP sequence counter
    await this.ssp.sendCommand(SSPCommand.SYNC);
    this.ssp.resetSequence();

    // RESET clears any stale jam/error state
    this._expectSlaveReset = true;
    await this.ssp.sendCommand(SSPCommand.RESET);

    // Wait for the device to finish rebooting
    await new Promise<void>((resolve) => setTimeout(resolve, this.opts.resetDelay));

    // Re-sync after reboot
    await this.ssp.sendCommand(SSPCommand.SYNC);
    this.ssp.resetSequence();

    // Set protocol version
    await this.ssp.sendCommand(
      SSPCommand.HOST_PROTOCOL_VERSION,
      Buffer.from([this.opts.protocolVersion]),
    );

    // Query device serial number
    const serialResult = await this.ssp.sendCommand(SSPCommand.GET_SERIAL_NUMBER);
    if (serialResult.success && serialResult.data.length >= 4) {
      const newSerial = serialResult.data.readUInt32BE(0).toString();
      if (this._serialNumber !== null && this._serialNumber !== newSerial) {
        this.emit(
          'error',
          new Error(
            `Device serial changed: expected ${this._serialNumber}, got ${newSerial}. Device may have been swapped.`,
          ),
        );
      }
      this._serialNumber = newSerial;
    }

    // Get unit metadata and setup
    await this.ssp.sendCommand(SSPCommand.UNIT_DATA);
    await this.ssp.sendCommand(SSPCommand.SETUP_REQUEST);

    // Enable all configured channels
    await this.ssp.sendCommand(SSPCommand.SET_INHIBITS, this.buildInhibitBytes());

    // Enable the device
    const result = await this.ssp.sendCommand(SSPCommand.ENABLE);
    if (!result.success) {
      throw new Error('Failed to enable device');
    }

    this._jammed = false;
    this._stackerFull = false;
    this._notePathOpen = false;
    this._noteHeld = false;

    const wasReconnecting = this._reconnectAttempt > 0;
    this._reconnectAttempt = 0;

    this.updateStatus('enabled');

    // Start polling for events
    this.ssp.startPolling(POLL_INTERVAL_MS, (events) => this.handlePollEvents(events));

    if (wasReconnecting) {
      this.emit('reconnected');
    }

    this.emit('ready');
  }

  private async reinitialize(): Promise<void> {
    if (!this.ssp) throw new Error('No SSP connection');

    this.ssp.stopPolling();

    await this.ssp.sendCommand(SSPCommand.SYNC);
    this.ssp.resetSequence();

    await this.ssp.sendCommand(
      SSPCommand.HOST_PROTOCOL_VERSION,
      Buffer.from([this.opts.protocolVersion]),
    );

    await this.ssp.sendCommand(SSPCommand.SETUP_REQUEST);
    await this.ssp.sendCommand(SSPCommand.SET_INHIBITS, this.buildInhibitBytes());

    const result = await this.ssp.sendCommand(SSPCommand.ENABLE);
    if (!result.success) {
      throw new Error('Re-enable after SLAVE_RESET failed');
    }

    this._jammed = false;
    this._stackerFull = false;
    this._notePathOpen = false;
    this._noteHeld = false;
    this.updateStatus('enabled');

    this.ssp.startPolling(POLL_INTERVAL_MS, (events) => this.handlePollEvents(events));
    this.emit('ready');
  }
}
