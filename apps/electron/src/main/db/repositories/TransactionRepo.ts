import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { TransactionRecord } from '@kioskos/shared-types';

export interface CreateTransactionInput {
  sessionId: string;
  type: TransactionRecord['type'];
  amountCents: number;
  currency: string;
  deviceId: string;
  metadata?: Record<string, unknown>;
}

export class TransactionRepo {
  private insertStmt: Database.Statement;
  private getByIdStmt: Database.Statement;
  private getBySessionStmt: Database.Statement;
  private getUnsyncedStmt: Database.Statement;
  private markSyncedStmt: Database.Statement;
  private getSessionTotalStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO transactions (id, session_id, type, amount_cents, currency, device_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    this.getBySessionStmt = db.prepare(
      'SELECT * FROM transactions WHERE session_id = ? ORDER BY created_at',
    );
    this.getUnsyncedStmt = db.prepare(
      'SELECT * FROM transactions WHERE synced = 0 ORDER BY created_at LIMIT ?',
    );

    this.markSyncedStmt = db.prepare(`
      UPDATE transactions SET synced = 1, synced_at = datetime('now') WHERE id = ?
    `);

    this.getSessionTotalStmt = db.prepare(`
      SELECT COALESCE(SUM(
        CASE
          WHEN type IN ('bill_stack', 'coin_insert') THEN amount_cents
          WHEN type IN ('cash_dispensed') THEN -amount_cents
          ELSE 0
        END
      ), 0) as total_cents
      FROM transactions
      WHERE session_id = ?
    `);
  }

  create(input: CreateTransactionInput): TransactionRecord {
    const id = uuid();
    this.insertStmt.run(
      id,
      input.sessionId,
      input.type,
      input.amountCents,
      input.currency,
      input.deviceId,
      input.metadata ? JSON.stringify(input.metadata) : null,
    );
    return this.getById(id)!;
  }

  getById(id: string): TransactionRecord | null {
    const row = this.getByIdStmt.get(id) as RawTransactionRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  getBySession(sessionId: string): TransactionRecord[] {
    const rows = this.getBySessionStmt.all(sessionId) as RawTransactionRow[];
    return rows.map((r) => this.mapRow(r));
  }

  getUnsynced(limit = 100): TransactionRecord[] {
    const rows = this.getUnsyncedStmt.all(limit) as RawTransactionRow[];
    return rows.map((r) => this.mapRow(r));
  }

  markSynced(id: string): void {
    this.markSyncedStmt.run(id);
  }

  markManySynced(ids: string[]): void {
    const txn = this.db.transaction((idList: string[]) => {
      for (const id of idList) {
        this.markSyncedStmt.run(id);
      }
    });
    txn(ids);
  }

  getSessionTotalCents(sessionId: string): number {
    const row = this.getSessionTotalStmt.get(sessionId) as { total_cents: number };
    return row.total_cents;
  }

  private mapRow(row: RawTransactionRow): TransactionRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type as TransactionRecord['type'],
      amountCents: row.amount_cents,
      currency: row.currency,
      deviceId: row.device_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      synced: row.synced === 1,
      createdAt: row.created_at,
      syncedAt: row.synced_at,
    };
  }
}

interface RawTransactionRow {
  id: string;
  session_id: string;
  type: string;
  amount_cents: number;
  currency: string;
  device_id: string;
  metadata: string | null;
  synced: number;
  created_at: string;
  synced_at: string | null;
}
