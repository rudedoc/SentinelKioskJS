import type Database from 'better-sqlite3';
import type { UserEventRecord } from '@kioskos/shared-types';

export interface CreateUserEventInput {
  sessionId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

export class UserEventRepo {
  private insertStmt: Database.Statement;
  private getUnsyncedStmt: Database.Statement;
  private markSyncedStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO user_events (session_id, event_type, payload) VALUES (?, ?, ?)
    `);

    this.getUnsyncedStmt = db.prepare(
      'SELECT * FROM user_events WHERE synced = 0 ORDER BY created_at LIMIT ?',
    );

    this.markSyncedStmt = db.prepare('UPDATE user_events SET synced = 1 WHERE id = ?');
  }

  create(input: CreateUserEventInput): number {
    const result = this.insertStmt.run(
      input.sessionId,
      input.eventType,
      input.payload ? JSON.stringify(input.payload) : null,
    );
    return Number(result.lastInsertRowid);
  }

  getUnsynced(limit = 100): UserEventRecord[] {
    const rows = this.getUnsyncedStmt.all(limit) as RawUserEventRow[];
    return rows.map((r) => this.mapRow(r));
  }

  markSynced(id: number): void {
    this.markSyncedStmt.run(id);
  }

  private mapRow(row: RawUserEventRow): UserEventRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      eventType: row.event_type,
      payload: row.payload ? JSON.parse(row.payload) : null,
      synced: row.synced === 1,
      createdAt: row.created_at,
    };
  }
}

interface RawUserEventRow {
  id: number;
  session_id: string;
  event_type: string;
  payload: string | null;
  synced: number;
  created_at: string;
}
