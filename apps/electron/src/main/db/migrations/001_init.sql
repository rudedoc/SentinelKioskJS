-- Core tables for KioskOS

-- Money transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'bill_insert', 'bill_stack', 'bill_reject',
    'coin_insert', 'coin_reject',
    'cash_dispensed', 'reconciliation'
  )),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  device_id TEXT NOT NULL,
  metadata TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_synced ON transactions(synced);
CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Hardware events
CREATE TABLE IF NOT EXISTS hardware_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_category TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error', 'critical')),
  payload TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hw_events_synced ON hardware_events(synced);
CREATE INDEX IF NOT EXISTS idx_hw_events_device ON hardware_events(device_id);

-- User / session events
CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_events_synced ON user_events(synced);
CREATE INDEX IF NOT EXISTS idx_user_events_session ON user_events(session_id);

-- Sync queue metadata
CREATE TABLE IF NOT EXISTS sync_state (
  table_name TEXT PRIMARY KEY,
  last_synced_id TEXT,
  last_synced_at TEXT
);

-- Local config overrides
CREATE TABLE IF NOT EXISTS local_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
