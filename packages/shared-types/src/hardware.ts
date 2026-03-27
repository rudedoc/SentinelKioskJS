export type HardwareCategory = 'printer' | 'bill-validator' | 'coin-validator' | 'nfc' | 'barcode';

export type HardwareConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface HardwareStatus {
  category: HardwareCategory;
  deviceId: string;
  manufacturer: string;
  model: string;
  connectionState: HardwareConnectionState;
  lastSeen: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface HardwareHealthReport {
  timestamp: string;
  devices: HardwareStatus[];
  overallHealthy: boolean;
}

export interface BillEvent {
  type: 'inserted' | 'stacked' | 'rejected' | 'returned';
  amountCents: number;
  currency: string;
  deviceId: string;
  timestamp: string;
  reason?: string;
}

export interface CoinEvent {
  type: 'inserted' | 'rejected';
  amountCents: number;
  currency: string;
  deviceId: string;
  timestamp: string;
  reason?: string;
}

export interface NFCEvent {
  type: 'read' | 'removed';
  uid: string;
  data: string | null;
  deviceId: string;
  timestamp: string;
}

export interface BarcodeEvent {
  type: 'scanned';
  value: string;
  format: string;
  deviceId: string;
  timestamp: string;
}

export interface ReceiptData {
  lines: ReceiptLine[];
  cutAfter?: boolean;
  openDrawer?: boolean;
}

export type ReceiptLine =
  | { type: 'text'; content: string; align?: 'left' | 'center' | 'right'; bold?: boolean }
  | { type: 'barcode'; value: string; format?: string }
  | { type: 'qr'; value: string }
  | { type: 'divider' }
  | { type: 'feed'; lines?: number };

export interface PrintResult {
  success: boolean;
  errorMessage?: string;
}

// ── Printer-specific status ──

export interface PrinterStatus {
  paperLow: boolean;
  coverOpen: boolean;
  errorState: string | null;
}

// ── Validator states ──

export type BillValidatorState =
  | 'idle'
  | 'accepting'
  | 'escrowed'
  | 'stacking'
  | 'returning'
  | 'disabled'
  | 'error';

export type CoinValidatorState = 'idle' | 'accepting' | 'disabled' | 'error';

// ── Adapter config types for different communication protocols ──

export interface SerialAdapterConfig {
  port: string;
  baudRate: number;
}

export interface USBAdapterConfig {
  vendorId: number;
  productId: number;
}

export interface NetworkAdapterConfig {
  host: string;
  port: number;
}

// ── Hardware error codes ──

export enum HardwareErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
  DEVICE_BUSY = 'DEVICE_BUSY',
  PAPER_JAM = 'PAPER_JAM',
  PAPER_OUT = 'PAPER_OUT',
  BILL_JAM = 'BILL_JAM',
  CASH_BOX_FULL = 'CASH_BOX_FULL',
  CASH_BOX_REMOVED = 'CASH_BOX_REMOVED',
  UNKNOWN_DEVICE = 'UNKNOWN_DEVICE',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
}

// ── Mock adapter configuration ──

export interface MockAdapterOptions {
  simulationIntervalMs?: number;
  failureRate?: number;
  autoStart?: boolean;
}
