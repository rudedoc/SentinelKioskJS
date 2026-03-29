import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import type { Logger } from 'winston';
import {
  SSPCommand,
  SSPResponse,
  type SSPCommandResult,
  type SSPPollEvent,
  type SSPConnectionOptions,
} from './SSPTypes';
import { buildPacket, extractFrame, parseResponse, parsePollEvents } from './SSPProtocol';

const DEFAULT_BAUD = 9600;
const DEFAULT_TIMEOUT = 2000;
const DEFAULT_RETRIES = 2;

interface PendingCommand {
  resolve: (result: SSPCommandResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SSPConnection extends EventEmitter {
  private port: SerialPort | null = null;
  private address: number;
  private baudRate: number;
  private timeout: number;
  private portPath: string;
  private sequence: number = 0;
  private rxBuffer: Buffer = Buffer.alloc(0);
  private pending: PendingCommand | null = null;
  private commandQueue: Array<{
    command: number;
    params: Buffer | undefined;
    resolve: (result: SSPCommandResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _isOpen = false;
  private logger: Logger | undefined;

  constructor(options: SSPConnectionOptions, logger?: Logger) {
    super();
    this.portPath = options.port;
    this.address = options.address ?? 0x00;
    this.baudRate = options.baudRate ?? DEFAULT_BAUD;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.logger = logger;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  async open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
      });

      this.port.on('data', (chunk: Buffer) => {
        this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
        this.tryResolveFrame();
      });

      this.port.on('close', () => {
        this._isOpen = false;
        this.emit('close');
      });

      this.port.on('error', (err: Error) => {
        this.emit('error', err);
      });

      this.port.open((err) => {
        if (err) {
          reject(err);
          return;
        }

        // Flush buffers
        try {
          this.port!.flush();
        } catch {
          // Some platforms don't support flush
        }

        this._isOpen = true;
        this.sequence = 0;
        this.rxBuffer = Buffer.alloc(0);
        this.emit('open');
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.stopPolling();

    // Reject any pending command
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Connection closed'));
      this.pending = null;
    }

    // Reject queued commands
    for (const queued of this.commandQueue) {
      queued.reject(new Error('Connection closed'));
    }
    this.commandQueue = [];

    if (!this.port) return;

    return new Promise<void>((resolve) => {
      this.port!.close((err) => {
        if (err) {
          this.logger?.warn('Error closing SSP port', { error: err.message });
        }
        this.port = null;
        this._isOpen = false;
        resolve();
      });
    });
  }

  /**
   * Send an SSP command and wait for the response.
   * Commands are queued — only one in-flight at a time.
   * Includes retry logic with SYNC recovery on repeated failure.
   */
  async sendCommand(command: number, params?: Buffer): Promise<SSPCommandResult> {
    return new Promise<SSPCommandResult>((resolve, reject) => {
      if (this.pending) {
        // Queue the command
        this.commandQueue.push({ command, params, resolve, reject });
      } else {
        this.executeCommand(command, params, resolve, reject);
      }
    });
  }

  /**
   * Start a polling loop that sends POLL commands at a fixed interval.
   */
  startPolling(intervalMs: number, callback: (events: SSPPollEvent[]) => void): void {
    this.stopPolling();

    this.pollTimer = setInterval(async () => {
      try {
        const result = await this.sendCommand(SSPCommand.POLL);
        if (result.success && result.data.length > 0) {
          const events = parsePollEvents(result.data);
          if (events.length > 0) {
            callback(events);
          }
        }
      } catch {
        // Poll failures are expected during transient issues; don't crash the loop
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Reset the sequence bit to 0 (called after SYNC) */
  resetSequence(): void {
    this.sequence = 0;
  }

  private executeCommand(
    command: number,
    params: Buffer | undefined,
    resolve: (result: SSPCommandResult) => void,
    reject: (error: Error) => void,
  ): void {
    this.sendWithRetry(command, params, DEFAULT_RETRIES)
      .then((result) => {
        resolve(result);
        this.processNextInQueue();
      })
      .catch((err) => {
        reject(err);
        this.processNextInQueue();
      });
  }

  private processNextInQueue(): void {
    const next = this.commandQueue.shift();
    if (next) {
      this.executeCommand(next.command, next.params, next.resolve, next.reject);
    }
  }

  private async sendWithRetry(
    command: number,
    params: Buffer | undefined,
    retries: number,
  ): Promise<SSPCommandResult> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.rawSend(command, params);
        if (result) {
          // Toggle sequence on success
          this.sequence = this.sequence === 0 ? 1 : 0;

          // After SYNC, force next command to seq=0
          if (command === SSPCommand.SYNC) {
            this.sequence = 0;
          }

          return result;
        }
      } catch {
        // Continue to next attempt
      }
    }

    // Recovery: try SYNC then resend once
    try {
      await this.syncRecovery();
      const result = await this.rawSend(command, params);
      if (result) {
        this.sequence = this.sequence === 0 ? 1 : 0;
        return result;
      }
    } catch {
      // Recovery failed
    }

    return { success: false, response: 0xff, data: Buffer.alloc(0) };
  }

  private async syncRecovery(): Promise<void> {
    // Flush buffers
    this.rxBuffer = Buffer.alloc(0);
    if (this.port?.isOpen) {
      try {
        this.port.flush();
      } catch {
        // ignore
      }
    }

    // Send SYNC
    const syncResult = await this.rawSend(SSPCommand.SYNC);
    if (syncResult && syncResult.response === SSPResponse.OK) {
      this.sequence = 0;
    }
  }

  private rawSend(command: number, params?: Buffer): Promise<SSPCommandResult | null> {
    return new Promise<SSPCommandResult | null>((resolve, reject) => {
      if (!this.port?.isOpen) {
        reject(new Error('Port not open'));
        return;
      }

      const packet = buildPacket(this.address, this.sequence, command, params);

      // Set up timeout
      const timer = setTimeout(() => {
        this.pending = null;
        resolve(null); // timeout — not an error, just no response
      }, this.timeout);

      this.pending = {
        resolve: (result: SSPCommandResult) => {
          clearTimeout(timer);
          this.pending = null;
          resolve(result);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          this.pending = null;
          reject(err);
        },
        timer,
      };

      // Clear stale data
      this.rxBuffer = Buffer.alloc(0);

      this.port.write(packet, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending = null;
          reject(err);
        }
      });
    });
  }

  private tryResolveFrame(): void {
    if (!this.pending) return;

    const result = extractFrame(this.rxBuffer);
    if (!result) return;

    this.rxBuffer = result.remainder;
    const parsed = parseResponse(result.payload);
    this.pending.resolve(parsed);
  }
}
