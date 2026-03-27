export type HardwareCategory =
  | 'printer'
  | 'bill-validator'
  | 'coin-validator'
  | 'nfc'
  | 'barcode';

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
