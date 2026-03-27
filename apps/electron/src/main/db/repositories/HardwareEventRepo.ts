import type Database from 'better-sqlite3';
import type { HardwareEventRecord } from '@kioskos/shared-types';

export interface CreateHardwareEventInput {
  deviceCategory: string;
  deviceId: string;
  eventType: string;
  severity: HardwareEventRecord['severity'];
  payload?: Record<string, unknown>;
}

export class HardwareEventRepo {
  private insertStmt: Database.Statement;
  private getUnsyncedStmt: Database.Statement;
  private markSyncedStmt: Database.Statement;
  private getRecentStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO hardware_events (device_category, device_id, event_type, severity, payload)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.getUnsyncedStmt = db.prepare(
      'SELECT * FROM hardware_events WHERE synced = 0 ORDER BY created_at LIMIT ?',
    );

    this.markSyncedStmt = db.prepare('UPDATE hardware_events SET synced = 1 WHERE id = ?');

    this.getRecentStmt = db.prepare(
      'SELECT * FROM hardware_events ORDER BY created_at DESC LIMIT ?',
    );
  }

  create(input: CreateHardwareEventInput): number {
    const result = this.insertStmt.run(
      input.deviceCategory,
      input.deviceId,
      input.eventType,
      input.severity,
      input.payload ? JSON.stringify(input.payload) : null,
    );
    return Number(result.lastInsertRowid);
  }

  getUnsynced(limit = 100): HardwareEventRecord[] {
    const rows = this.getUnsyncedStmt.all(limit) as RawHardwareEventRow[];
    return rows.map((r) => this.mapRow(r));
  }

  markSynced(id: number): void {
    this.markSyncedStmt.run(id);
  }

  getRecent(limit = 50): HardwareEventRecord[] {
    const rows = this.getRecentStmt.all(limit) as RawHardwareEventRow[];
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: RawHardwareEventRow): HardwareEventRecord {
    return {
      id: row.id,
      deviceCategory: row.device_category,
      deviceId: row.device_id,
      eventType: row.event_type,
      severity: row.severity as HardwareEventRecord['severity'],
      payload: row.payload ? JSON.parse(row.payload) : null,
      synced: row.synced === 1,
      createdAt: row.created_at,
    };
  }
}

interface RawHardwareEventRow {
  id: number;
  device_category: string;
  device_id: string;
  event_type: string;
  severity: string;
  payload: string | null;
  synced: number;
  created_at: string;
}
