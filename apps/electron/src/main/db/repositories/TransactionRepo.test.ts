import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TransactionRepo } from './TransactionRepo';

describe('TransactionRepo', () => {
  let db: Database.Database;
  let repo: TransactionRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const migration = readFileSync(join(__dirname, '../migrations/001_init.sql'), 'utf-8');
    db.exec(migration);

    repo = new TransactionRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a transaction and retrieve it by id', () => {
    const txn = repo.create({
      sessionId: 'sess-001',
      type: 'bill_stack',
      amountCents: 500,
      currency: 'USD',
      deviceId: 'bill-validator-1',
    });

    expect(txn.id).toBeDefined();
    expect(txn.sessionId).toBe('sess-001');
    expect(txn.type).toBe('bill_stack');
    expect(txn.amountCents).toBe(500);
    expect(txn.synced).toBe(false);

    const fetched = repo.getById(txn.id);
    expect(fetched).toEqual(txn);
  });

  it('should return null for non-existent id', () => {
    expect(repo.getById('nonexistent')).toBeNull();
  });

  it('should get transactions by session', () => {
    repo.create({
      sessionId: 'sess-A',
      type: 'bill_stack',
      amountCents: 100,
      currency: 'USD',
      deviceId: 'd1',
    });
    repo.create({
      sessionId: 'sess-A',
      type: 'coin_insert',
      amountCents: 25,
      currency: 'USD',
      deviceId: 'd2',
    });
    repo.create({
      sessionId: 'sess-B',
      type: 'bill_stack',
      amountCents: 500,
      currency: 'USD',
      deviceId: 'd1',
    });

    const sessA = repo.getBySession('sess-A');
    expect(sessA).toHaveLength(2);

    const sessB = repo.getBySession('sess-B');
    expect(sessB).toHaveLength(1);
  });

  it('should calculate session total correctly', () => {
    repo.create({
      sessionId: 's1',
      type: 'bill_stack',
      amountCents: 500,
      currency: 'USD',
      deviceId: 'd1',
    });
    repo.create({
      sessionId: 's1',
      type: 'coin_insert',
      amountCents: 100,
      currency: 'USD',
      deviceId: 'd2',
    });
    repo.create({
      sessionId: 's1',
      type: 'bill_reject',
      amountCents: 1000,
      currency: 'USD',
      deviceId: 'd1',
    });
    repo.create({
      sessionId: 's1',
      type: 'cash_dispensed',
      amountCents: 200,
      currency: 'USD',
      deviceId: 'd3',
    });

    const total = repo.getSessionTotalCents('s1');
    expect(total).toBe(400); // 500 + 100 - 200
  });

  it('should return 0 for empty session', () => {
    expect(repo.getSessionTotalCents('nonexistent')).toBe(0);
  });

  it('should track and mark synced status', () => {
    const txn1 = repo.create({
      sessionId: 's1',
      type: 'bill_stack',
      amountCents: 100,
      currency: 'USD',
      deviceId: 'd1',
    });
    const txn2 = repo.create({
      sessionId: 's1',
      type: 'coin_insert',
      amountCents: 50,
      currency: 'USD',
      deviceId: 'd2',
    });

    const unsynced = repo.getUnsynced(10);
    expect(unsynced).toHaveLength(2);

    repo.markSynced(txn1.id);

    const unsyncedAfter = repo.getUnsynced(10);
    expect(unsyncedAfter).toHaveLength(1);
    expect(unsyncedAfter[0]!.id).toBe(txn2.id);
  });

  it('should mark many synced in a transaction', () => {
    const t1 = repo.create({
      sessionId: 's1',
      type: 'bill_stack',
      amountCents: 100,
      currency: 'USD',
      deviceId: 'd1',
    });
    const t2 = repo.create({
      sessionId: 's1',
      type: 'bill_stack',
      amountCents: 200,
      currency: 'USD',
      deviceId: 'd1',
    });
    const t3 = repo.create({
      sessionId: 's1',
      type: 'bill_stack',
      amountCents: 300,
      currency: 'USD',
      deviceId: 'd1',
    });

    repo.markManySynced([t1.id, t2.id]);

    const unsynced = repo.getUnsynced(10);
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0]!.id).toBe(t3.id);
  });

  it('should store and retrieve metadata as JSON', () => {
    const meta = { rejectionReason: 'crumpled', sensorReading: 42 };
    const txn = repo.create({
      sessionId: 's1',
      type: 'bill_reject',
      amountCents: 0,
      currency: 'USD',
      deviceId: 'd1',
      metadata: meta,
    });

    const fetched = repo.getById(txn.id);
    expect(fetched?.metadata).toEqual(meta);
  });
});
