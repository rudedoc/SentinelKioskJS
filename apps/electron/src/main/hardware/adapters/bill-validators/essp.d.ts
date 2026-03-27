/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Type declarations for encrypted-smiley-secure-protocol
 *
 * This library has no built-in TypeScript types, so we declare the
 * subset of the API we actually use. Expand as needed.
 */

declare module 'encrypted-smiley-secure-protocol' {
  import { EventEmitter } from 'events';

  interface SSPOptions {
    /** Slave device ID (0x00 for single device) */
    id: number;
    /** Enable debug logging to console */
    debug: boolean;
    /** Command timeout in milliseconds */
    timeout: number;
    /** Fixed encryption key (16 hex chars). Use default '0123456701234567' if not using encryption */
    fixedKey: string;
    /** Encrypt all commands (default false, use true for eSSP) */
    encryptAllCommand?: boolean;
  }

  interface SSPCommandResult {
    success: boolean;
    status: string;
    command: string;
    info: Record<string, any>;
  }

  interface SSPEventResult {
    value: number;
    channel: number;
    name?: string;
  }

  class SSP extends EventEmitter {
    constructor(options: SSPOptions);

    /** Open serial connection to device */
    open(port: string): void;

    /** Close serial connection */
    close(): void;

    /** Initialize Diffie-Hellman encryption (only needed for eSSP) */
    initEncryption(): Promise<SSPCommandResult>;

    /** Enable the device and start polling for events */
    enable(): Promise<SSPCommandResult>;

    /** Disable the device and stop polling */
    disable(): Promise<SSPCommandResult>;

    /** Send a command to the device */
    command(command: string, options?: Record<string, any>): Promise<SSPCommandResult>;

    // Lifecycle events
    on(event: 'OPEN', listener: () => void): this;
    on(event: 'CLOSE', listener: () => void): this;

    // Note processing events
    on(event: 'READ_NOTE', listener: (result: SSPEventResult) => void): this;
    on(event: 'CREDIT_NOTE', listener: (result: SSPEventResult) => void): this;
    on(event: 'NOTE_REJECTING', listener: (result: SSPEventResult) => void): this;
    on(event: 'NOTE_REJECTED', listener: (result: SSPEventResult) => void): this;
    on(event: 'NOTE_STACKING', listener: (result: SSPEventResult) => void): this;
    on(event: 'NOTE_STACKED', listener: (result: SSPEventResult) => void): this;

    // Device status events
    on(event: 'DISABLED', listener: (result: SSPEventResult) => void): this;
    on(event: 'SAFE_NOTE_JAM', listener: (result: SSPEventResult) => void): this;
    on(event: 'UNSAFE_NOTE_JAM', listener: (result: SSPEventResult) => void): this;
    on(event: 'STACKER_FULL', listener: (result: SSPEventResult) => void): this;
    on(event: 'FRAUD_ATTEMPT', listener: (result: SSPEventResult) => void): this;
    on(event: 'CASHBOX_REMOVED', listener: (result: SSPEventResult) => void): this;
    on(event: 'CASHBOX_REPLACED', listener: (result: SSPEventResult) => void): this;

    // Reset/clear events
    on(event: 'SLAVE_RESET', listener: (result: SSPEventResult) => void): this;
    on(event: 'NOTE_CLEARED_FROM_FRONT', listener: (result: SSPEventResult) => void): this;
    on(event: 'NOTE_CLEARED_TO_CASHBOX', listener: (result: SSPEventResult) => void): this;
    on(event: 'NOTE_PATH_OPEN', listener: (result: SSPEventResult) => void): this;
    on(event: 'CHANNEL_DISABLE', listener: (result: SSPEventResult) => void): this;

    // Catch-all for any other events
    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
  }

  export default SSP;
}
