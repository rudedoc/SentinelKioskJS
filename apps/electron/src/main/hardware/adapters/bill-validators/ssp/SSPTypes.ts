// ── SSP Transport ──

export const SSP_STX = 0x7f;

// ── Commands (host → device) ──

export const SSPCommand = {
  SYNC: 0x11,
  RESET: 0x01,
  HOST_PROTOCOL_VERSION: 0x06,
  SETUP_REQUEST: 0x05,
  SET_INHIBITS: 0x02,
  ENABLE: 0x0a,
  DISABLE: 0x09,
  POLL: 0x07,
  LAST_REJECT_CODE: 0x17,
  HOLD: 0x18,
  REJECT: 0x08,
  GET_SERIAL_NUMBER: 0x0c,
  UNIT_DATA: 0x0d,
} as const;

// ── Response codes (device → host) ──

export const SSPResponse = {
  OK: 0xf0,
  COMMAND_NOT_KNOWN: 0xf2,
  WRONG_PARAMS: 0xf3,
  PARAM_OUT_OF_RANGE: 0xf4,
  COMMAND_CANNOT_BE_PROCESSED: 0xf5,
  SOFTWARE_ERROR: 0xf6,
  FAIL: 0xf8,
  KEY_NOT_SET: 0xfa,
} as const;

// ── Poll event codes ──

export const SSPEvent = {
  SLAVE_RESET: 0xf1,
  READ_NOTE: 0xef,
  CREDIT_NOTE: 0xee,
  REJECTING: 0xed,
  REJECTED: 0xec,
  STACKING: 0xcc,
  STACKED: 0xeb,
  DISABLED: 0xe8,
  SAFE_JAM: 0xea,
  UNSAFE_JAM: 0xe9,
  FRAUD_ATTEMPT: 0xe6,
  STACKER_FULL: 0xe7,
  CASHBOX_REMOVED: 0xe3,
  CASHBOX_REPLACED: 0xe4,
  NOTE_CLEARED_FROM_FRONT: 0xe1,
  NOTE_CLEARED_TO_CASHBOX: 0xe2,
  NOTE_PATH_OPEN: 0xe0,
  CHANNEL_DISABLE: 0xb5,
} as const;

/** Event codes where the next byte in the poll stream is a channel number */
export const EVENTS_WITH_CHANNEL = new Set<number>([
  SSPEvent.READ_NOTE,
  SSPEvent.CREDIT_NOTE,
  SSPEvent.FRAUD_ATTEMPT,
  SSPEvent.NOTE_CLEARED_FROM_FRONT,
  SSPEvent.NOTE_CLEARED_TO_CASHBOX,
]);

/** Human-readable reject reasons by code */
export const REJECT_REASONS: Record<number, string> = {
  0x00: 'No reason / Accepted',
  0x01: 'Note too long',
  0x02: 'Note too short',
  0x03: 'Invalid note',
  0x04: 'Accept gate not ready',
  0x05: 'Channel inhibited',
  0x06: 'Second note inserted',
  0x07: 'Reject by host',
  0x08: 'Note recognised on second validation',
  0x09: 'Note too long on validation',
  0x0a: 'Cannot validate note',
  0x0b: 'Note too short on validation',
  0x0c: 'Invalid note read',
};

// ── Interfaces ──

export interface SSPCommandResult {
  success: boolean;
  response: number;
  data: Buffer;
}

export interface SSPPollEvent {
  code: number;
  name: string;
  channel?: number;
}

export interface SSPConnectionOptions {
  port: string;
  address?: number;
  baudRate?: number;
  timeout?: number;
}

/** Map event code to human-readable name */
export function eventName(code: number): string {
  for (const [name, value] of Object.entries(SSPEvent)) {
    if (value === code) return name;
  }
  return `UNKNOWN_0x${code.toString(16)}`;
}
