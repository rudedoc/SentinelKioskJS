import { EventEmitter } from 'events';
import SSP from 'encrypted-smiley-secure-protocol';

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
  /** Use eSSP encryption. Default: false */
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
  /** Current device status */
  status: NV9Status;
  /** Whether the cashbox is present */
  cashboxPresent: boolean;
  /** Whether the stacker is full */
  stackerFull: boolean;
  /** Whether a note jam has been detected */
  jammed: boolean;
  /** Whether note path is open */
  notePathOpen: boolean;
  /** Whether a note is currently held in escrow */
  noteHeld: boolean;
  /** Device serial number (set after initialization) */
  serialNumber: string | null;
}

export interface NV9Events {
  /** Device is connected and ready to accept notes */
  ready: [];
  /** A note has been identified and is in escrow (escrow mode) or being accepted */
  escrow: [event: NV9NoteEvent];
  /** A note has been credited (stacked successfully) */
  credit: [event: NV9NoteEvent];
  /** Note is being rejected (in transit back to user) */
  rejecting: [];
  /** A note was rejected — call rejectReason for details */
  rejected: [reason?: Record<string, unknown>];
  /** Note is being stacked (moving to cashbox) */
  stacking: [];
  /** Note has been physically stacked in cashbox */
  stacked: [];
  /** Cashbox was removed */
  cashboxRemoved: [];
  /** Cashbox was replaced */
  cashboxReplaced: [];
  /** Stacker is full */
  stackerFull: [];
  /** Note jam (safe — not user-accessible) */
  safeJam: [];
  /** Note jam (unsafe — user may be able to remove) */
  unsafeJam: [];
  /** Fraud attempt detected */
  fraud: [event: NV9NoteEvent];
  /** Device reported disabled state */
  disabled: [];
  /** Device has reset (power cycle or RESET command) */
  slaveReset: [];
  /** Note was cleared from the front of the device at reset */
  noteClearedFromFront: [event: NV9NoteEvent];
  /** Note was cleared into the cashbox at reset */
  noteClearedToCashbox: [event: NV9NoteEvent];
  /** Note path is open — device cannot accept notes */
  notePathOpen: [];
  /** All channels have been inhibited */
  channelDisable: [];
  /** Serial port opened */
  open: [];
  /** Serial port closed */
  close: [];
  /** Non-fatal error during operation */
  error: [error: Error];
  /** Device state changed */
  stateChange: [state: NV9State];
  /** Reconnection attempt */
  reconnecting: [attempt: number, maxAttempts: number];
  /** Reconnection succeeded */
  reconnected: [];
}

// ============================================================
// Implementation
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface NV9BillValidator {
  on<K extends keyof NV9Events>(event: K, listener: (...args: NV9Events[K]) => void): this;
  emit<K extends keyof NV9Events>(event: K, ...args: NV9Events[K]): boolean;
  off<K extends keyof NV9Events>(event: K, listener: (...args: NV9Events[K]) => void): this;
  once<K extends keyof NV9Events>(event: K, listener: (...args: NV9Events[K]) => void): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class NV9BillValidator extends EventEmitter {
  private eSSP: InstanceType<typeof SSP> | null = null;
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

  /** Current device state snapshot. Always available, no async needed. */
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

  /** Open the serial connection and initialize the device. */
  connect(): void {
    if (this.eSSP) {
      throw new Error('Already connected. Call disconnect() first.');
    }

    this.running = true;
    this._intentionalDisconnect = false;
    this._reconnectAttempt = 0;
    this.updateStatus('connecting');

    this.openConnection();
  }

  /** Disable the device and close the serial connection. */
  async disconnect(): Promise<void> {
    this._intentionalDisconnect = true;
    this.cancelReconnect();
    this.stopHoldLoop();

    if (!this.eSSP || !this.running) {
      this.running = false;
      return;
    }
    this.running = false;

    try {
      await this.eSSP.disable();
    } catch {
      // best-effort
    }

    try {
      this.eSSP.close();
    } catch {
      // best-effort
    }

    this.eSSP = null;
    this._noteHeld = false;
    this.updateStatus('disconnected');
  }

  /**
   * Accept the note currently held in escrow (stacks it into the cashbox).
   * Stops sending HOLD — the next poll will cause the device to stack the note.
   */
  acceptNote(): void {
    if (!this._noteHeld) return;
    this.stopHoldLoop();
    this._noteHeld = false;
    this.emitStateChange();
    // Polling continues — next poll causes the device to stack the note
  }

  /**
   * Reject the note currently held in escrow (returns it to the user).
   * Sends REJECT command to the device.
   */
  async rejectNote(): Promise<void> {
    if (!this._noteHeld || !this.eSSP) return;
    this.stopHoldLoop();
    this._noteHeld = false;
    this.emitStateChange();
    await this.eSSP.command('REJECT_BANKNOTE');
  }

  /**
   * Attempt to recover the device from a jammed/disabled/error state.
   * Sends SYNC to reset the SSP state machine, re-configures channels,
   * and re-enables the device. Clears the jammed flag if successful.
   */
  async recover(): Promise<void> {
    if (!this.eSSP) {
      throw new Error('Not connected. Call connect() first.');
    }

    const eSSP = this.eSSP;

    await eSSP.command('SYNC');

    await eSSP.command('HOST_PROTOCOL_VERSION', {
      version: this.opts.protocolVersion,
    });

    const channels = Object.keys(this.opts.channelValues).map(() => 1);
    await eSSP.command('SET_CHANNEL_INHIBITS', { channels });

    const result = await eSSP.enable();
    if (result.status !== 'OK') {
      throw new Error(`Recovery failed — device did not re-enable: ${result.status}`);
    }

    this._jammed = false;
    this._stackerFull = false;
    this._notePathOpen = false;
    this._noteHeld = false;
    this.updateStatus('enabled');
    this.emit('ready');
  }

  /**
   * Send a hardware RESET command to the device, forcing a full firmware
   * restart (equivalent to a power cycle). The serial connection stays open
   * and the device will fire DISABLED events as it reboots, then the class
   * will re-initialize automatically via the OPEN/DISABLED → recover path.
   */
  async reset(): Promise<void> {
    if (!this.eSSP) {
      throw new Error('Not connected. Call connect() first.');
    }

    await this.eSSP.command('RESET');
    this._jammed = false;
    this._stackerFull = false;
    this._noteHeld = false;
    this.updateStatus('connecting');
  }

  /** Map a channel number to its currency value. */
  channelValue(channel: number): number {
    return this.opts.channelValues[channel] ?? 0;
  }

  // ---- private ---------------------------------------------------

  private openConnection(): void {
    this.eSSP = new SSP({
      id: this.opts.slaveId,
      debug: this.opts.debug,
      timeout: this.opts.timeout,
      fixedKey: this.opts.fixedKey,
      encryptAllCommand: this.opts.useEncryption,
    });

    this.bindEvents(this.eSSP);
    this.eSSP.open(this.opts.port);
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
    // Prevent duplicate schedules (e.g. both init failure and CLOSE firing)
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

      // Clean up old connection — close and wait for CLOSE event
      // before reopening to avoid port locking
      if (this.eSSP) {
        const oldSSP = this.eSSP;
        this.eSSP = null;
        try {
          oldSSP.close();
        } catch {
          /* ignore */
        }
        // The CLOSE handler will fire, but since eSSP is already null
        // it won't trigger another reconnect. Give the OS time to
        // release the port.
        setTimeout(() => {
          if (!this.running || this._intentionalDisconnect) return;
          this.attemptReconnect();
        }, 500);
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

  private bindEvents(eSSP: InstanceType<typeof SSP>): void {
    eSSP.on('OPEN', () => {
      this.emit('open');
      this.initialize(eSSP).catch((err: unknown) => {
        this.updateStatus('error');
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
        // If init fails, attempt reconnection
        if (this.running && !this._intentionalDisconnect) {
          this.scheduleReconnect();
        }
      });
    });

    eSSP.on('CLOSE', () => {
      this.updateStatus('disconnected');
      this._noteHeld = false;
      this.emit('close');

      // Auto-reconnect on unexpected disconnect, but only if no
      // reconnection is already scheduled (e.g. from init failure)
      if (this.running && !this._intentionalDisconnect && !this._reconnectTimer) {
        this.eSSP = null;
        this.scheduleReconnect();
      }
    });

    // ---- Note lifecycle ----

    eSSP.on('READ_NOTE', (result) => {
      if (result.channel > 0 && !this._noteHeld) {
        this.emit('escrow', {
          channel: result.channel,
          value: this.channelValue(result.channel),
        });

        if (this.opts.escrow) {
          this._noteHeld = true;
          this.emitStateChange();
          // Stop polling and enter a HOLD loop — sends HOLD every 200ms
          // to keep the note in escrow until acceptNote() or rejectNote().
          this.startHoldLoop(eSSP);
        }
      }
    });

    eSSP.on('CREDIT_NOTE', (result) => {
      this._noteHeld = false;
      this.emit('credit', {
        channel: result.channel,
        value: this.channelValue(result.channel),
      });
      this.emitStateChange();
    });

    eSSP.on('NOTE_REJECTING', () => {
      this._noteHeld = false;
      this.emit('rejecting');
      this.emitStateChange();
    });

    eSSP.on('NOTE_REJECTED', async (_result) => {
      this._noteHeld = false;
      this.emitStateChange();
      let reason: Record<string, unknown> | undefined;
      try {
        const r = await eSSP.command('LAST_REJECT_CODE');
        reason = r.info;
      } catch {
        // ignore — device may not support this command
      }
      this.emit('rejected', reason);
    });

    eSSP.on('NOTE_STACKING', () => {
      this.emit('stacking');
    });

    eSSP.on('NOTE_STACKED', () => {
      this._noteHeld = false;
      this.emit('stacked');
      this.emitStateChange();
    });

    // ---- Device status events ----

    eSSP.on('DISABLED', () => {
      this.updateStatus('disabled');
      this.emit('disabled');
    });

    eSSP.on('CASHBOX_REMOVED', () => {
      this.updateState({ cashboxPresent: false });
      this.emit('cashboxRemoved');
    });

    eSSP.on('CASHBOX_REPLACED', () => {
      this.updateState({ cashboxPresent: true });
      this.emit('cashboxReplaced');
    });

    eSSP.on('STACKER_FULL', () => {
      this.updateState({ stackerFull: true });
      this.emit('stackerFull');
    });

    eSSP.on('SAFE_NOTE_JAM', () => {
      this._noteHeld = false;
      this.updateState({ jammed: true });
      this.emit('safeJam');
    });

    eSSP.on('UNSAFE_NOTE_JAM', () => {
      this._noteHeld = false;
      this.updateState({ jammed: true });
      this.emit('unsafeJam');
    });

    eSSP.on('FRAUD_ATTEMPT', (result) => {
      this.emit('fraud', {
        channel: result.channel,
        value: this.channelValue(result.channel),
      });
    });

    // ---- Reset/clear events ----

    eSSP.on('SLAVE_RESET', () => {
      this.emit('slaveReset');

      if (this._expectSlaveReset) {
        this._expectSlaveReset = false;
      }

      // Device has rebooted (either from our RESET or a power glitch)
      // and is now in disabled state — re-run setup to bring it back.
      this.reinitialize(eSSP).catch((err: unknown) => {
        this.updateStatus('error');
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      });
    });

    eSSP.on('NOTE_CLEARED_FROM_FRONT', (result) => {
      this._noteHeld = false;
      this.emit('noteClearedFromFront', {
        channel: result.channel,
        value: this.channelValue(result.channel),
      });
      this.emitStateChange();
    });

    eSSP.on('NOTE_CLEARED_TO_CASHBOX', (result) => {
      this._noteHeld = false;
      this.emit('noteClearedToCashbox', {
        channel: result.channel,
        value: this.channelValue(result.channel),
      });
      this.emitStateChange();
    });

    eSSP.on('NOTE_PATH_OPEN', () => {
      this.updateState({ notePathOpen: true });
      this.emit('notePathOpen');
    });

    eSSP.on('CHANNEL_DISABLE', () => {
      this.emit('channelDisable');
    });
  }

  /**
   * Stop polling and repeatedly send HOLD to keep the note in escrow.
   * The HOLD command resets the device's 10-second escrow timeout.
   * We send it every 200ms via exec() (bypassing the poll pipeline).
   */
  private startHoldLoop(eSSP: InstanceType<typeof SSP>): void {
    this.stopHoldLoop();

    // Send HOLD immediately, then every 200ms.
    // The library's poll loop is still running — command("HOLD") will
    // stop polling, send HOLD, then restart polling. Each subsequent
    // poll will get READ_NOTE again (note still in escrow), which
    // triggers another HOLD via this timer.
    const sendHold = () => {
      if (!this._noteHeld || !this.running) {
        this.stopHoldLoop();
        return;
      }
      eSSP.command('HOLD').catch(() => {
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

  private async initialize(eSSP: InstanceType<typeof SSP>): Promise<void> {
    // SYNC resets the SSP sequence counter, then RESET clears any stale
    // jam/error state from a previous session (equivalent to power cycle).
    // Note: the SSP library only emits poll events (like DISABLED) once
    // polling is active, so we use a fixed delay for the reboot.
    await eSSP.command('SYNC');

    // Flag that the upcoming SLAVE_RESET poll event is expected (from our
    // own RESET command) and should not trigger reinitialize.
    this._expectSlaveReset = true;
    await eSSP.command('RESET');

    // Wait for the device to finish rebooting
    await new Promise<void>((resolve) => setTimeout(resolve, this.opts.resetDelay));

    // Re-sync after reboot
    await eSSP.command('SYNC');

    // Set protocol version before any data commands
    await eSSP.command('HOST_PROTOCOL_VERSION', {
      version: this.opts.protocolVersion,
    });

    // Negotiate encryption if enabled
    if (this.opts.useEncryption) {
      await eSSP.initEncryption();
    }

    // Query device identity
    const serialResult = await eSSP.command('GET_SERIAL_NUMBER');
    if (serialResult.info && serialResult.info.serial_number !== undefined) {
      const newSerial = String(serialResult.info.serial_number);
      // Detect device swap
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

    // Get unit metadata (firmware version, type, etc.)
    await eSSP.command('UNIT_DATA');
    await eSSP.command('SETUP_REQUEST');

    // Enable all configured channels
    const channels = Object.keys(this.opts.channelValues).map(() => 1);
    await eSSP.command('SET_CHANNEL_INHIBITS', { channels });

    // Enable the device — starts accepting notes
    const result = await eSSP.enable();
    if (result.status !== 'OK') {
      throw new Error(`Failed to enable device: ${result.status}`);
    }

    this._jammed = false;
    this._stackerFull = false;
    this._notePathOpen = false;
    this._noteHeld = false;

    const wasReconnecting = this._reconnectAttempt > 0;
    this._reconnectAttempt = 0;

    this.updateStatus('enabled');

    if (wasReconnecting) {
      this.emit('reconnected');
    }

    this.emit('ready');
  }

  /**
   * Re-run the setup sequence after the device reports SLAVE_RESET.
   * Skips RESET (already happened) and serial number query (already known).
   */
  private async reinitialize(eSSP: InstanceType<typeof SSP>): Promise<void> {
    await eSSP.command('SYNC');

    await eSSP.command('HOST_PROTOCOL_VERSION', {
      version: this.opts.protocolVersion,
    });

    if (this.opts.useEncryption) {
      await eSSP.initEncryption();
    }

    await eSSP.command('SETUP_REQUEST');

    const channels = Object.keys(this.opts.channelValues).map(() => 1);
    await eSSP.command('SET_CHANNEL_INHIBITS', { channels });

    const result = await eSSP.enable();
    if (result.status !== 'OK') {
      throw new Error(`Re-enable after SLAVE_RESET failed: ${result.status}`);
    }

    this._jammed = false;
    this._stackerFull = false;
    this._notePathOpen = false;
    this._noteHeld = false;
    this.updateStatus('enabled');
    this.emit('ready');
  }
}
