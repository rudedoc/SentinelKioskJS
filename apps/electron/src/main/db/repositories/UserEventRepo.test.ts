import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UserEventRepo } from './UserEventRepo';

describe('UserEventRepo', () => {
  let db: Database.Database;
  let repo: UserEventRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    const migration = readFileSync(join(__dirname, '../migrations/001_init.sql'), 'utf-8');
    db.exec(migration);
    repo = new UserEventRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create user events', () => {
    const id = repo.create({
      sessionId: 'sess-001',
      eventType: 'page_view',
      payload: { page: '/checkout' },
    });

    expect(id).toBeGreaterThan(0);
  });

  it('should track sync status', () => {
    const id1 = repo.create({
      sessionId: 's1',
      eventType: 'tap',
      payload: { x: 100, y: 200 },
    });
    repo.create({
      sessionId: 's1',
      eventType: 'tap',
      payload: { x: 300, y: 400 },
    });

    expect(repo.getUnsynced(10)).toHaveLength(2);

    repo.markSynced(id1);
    expect(repo.getUnsynced(10)).toHaveLength(1);
  });

  it('should handle null payload', () => {
    repo.create({ sessionId: 's1', eventType: 'idle' });

    const events = repo.getUnsynced(10);
    expect(events[0]!.payload).toBeNull();
  });
});
