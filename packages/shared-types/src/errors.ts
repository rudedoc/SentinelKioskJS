/**
 * Base error for all KioskOS errors.
 * Every error in the system should extend this.
 */
export class KioskError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;

  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'KioskError';
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class HardwareError extends KioskError {
  public readonly deviceId: string;
  public readonly category: string;

  constructor(
    message: string,
    code: string,
    deviceId: string,
    category: string,
    context: Record<string, unknown> = {},
  ) {
    super(message, code, { ...context, deviceId, category });
    this.name = 'HardwareError';
    this.deviceId = deviceId;
    this.category = category;
  }
}

export class DatabaseError extends KioskError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'DB_ERROR', context);
    this.name = 'DatabaseError';
  }
}

export class IPCError extends KioskError {
  constructor(message: string, channel: string, context: Record<string, unknown> = {}) {
    super(message, 'IPC_ERROR', { ...context, channel });
    this.name = 'IPCError';
  }
}
