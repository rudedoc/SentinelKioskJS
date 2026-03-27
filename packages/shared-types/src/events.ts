export interface TransactionRecord {
  id: string;
  sessionId: string;
  type:
    | 'bill_insert'
    | 'bill_stack'
    | 'bill_reject'
    | 'coin_insert'
    | 'coin_reject'
    | 'cash_dispensed'
    | 'reconciliation';
  amountCents: number;
  currency: string;
  deviceId: string;
  metadata: Record<string, unknown> | null;
  synced: boolean;
  createdAt: string;
  syncedAt: string | null;
}

export interface HardwareEventRecord {
  id: number;
  deviceCategory: string;
  deviceId: string;
  eventType: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  payload: Record<string, unknown> | null;
  synced: boolean;
  createdAt: string;
}

export interface UserEventRecord {
  id: number;
  sessionId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  synced: boolean;
  createdAt: string;
}

export interface UserEvent {
  eventType: string;
  payload?: Record<string, unknown>;
}

export interface MoneyAmount {
  cents: number;
  currency: string;
}
