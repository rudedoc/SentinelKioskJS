import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HardwareEventRepo } from './HardwareEventRepo';

describe('HardwareEventRepo', () => {
  let db: Database.Database;
  let repo: HardwareEventRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    const migration = readFileSync(join(__dirname, '../migrations/001_init.sql'), 'utf-8');
    db.exec(migration);
    repo = new HardwareEventRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create and retrieve hardware events', () => {
    const id = repo.create({
      deviceCategory: 'bill-validator',
      deviceId: 'mei-001',
      eventType: 'jam_detected',
      severity: 'error',
      payload: { errorCode: 'E04' },
    });

    expect(id).toBeGreaterThan(0);

    const recent = repo.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.eventType).toBe('jam_detected');
    expect(recent[0]!.payload).toEqual({ errorCode: 'E04' });
  });

  it('should track sync status', () => {
    const id1 = repo.create({
      deviceCategory: 'printer',
      deviceId: 'p1',
      eventType: 'paper_low',
      severity: 'warn',
    });
    repo.create({
      deviceCategory: 'printer',
      deviceId: 'p1',
      eventType: 'paper_out',
      severity: 'error',
    });

    expect(repo.getUnsynced(10)).toHaveLength(2);

    repo.markSynced(id1);
    expect(repo.getUnsynced(10)).toHaveLength(1);
  });

  it('should return events in reverse chronological order for getRecent', () => {
    repo.create({
      deviceCategory: 'nfc',
      deviceId: 'n1',
      eventType: 'read',
      severity: 'info',
    });
    repo.create({
      deviceCategory: 'nfc',
      deviceId: 'n1',
      eventType: 'removed',
      severity: 'info',
    });

    const recent = repo.getRecent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.eventType).toBe('removed');
    expect(recent[1]!.eventType).toBe('read');
  });
});
