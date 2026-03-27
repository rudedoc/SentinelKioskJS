import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { createModuleLogger } from '../logger';

const log = createModuleLogger('database');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

export function initializeDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? join(app.getPath('userData'), 'kioskos.db');
  log.info('Opening database', { path });

  // Ensure directory exists
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(path);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Run all SQL migration files in order.
 * Migrations are numbered: 001_init.sql, 002_add_index.sql, etc.
 * Tracks which migrations have been applied in a `_migrations` table.
 */
function runMigrations(database: Database.Database): void {
  // Create migrations tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const dirs = [
    join(__dirname, '../../src/main/db/migrations'),
    join(__dirname, 'migrations'),
    join(process.cwd(), 'src/main/db/migrations'),
  ];

  let migrationFiles: string[] = [];
  let resolvedDir = '';

  for (const dir of dirs) {
    if (existsSync(dir)) {
      migrationFiles = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      resolvedDir = dir;
      break;
    }
  }

  if (migrationFiles.length === 0) {
    log.warn('No migration files found');
    return;
  }

  const applied = new Set(
    database
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const runMigration = database.transaction((name: string, sql: string) => {
    database.exec(sql);
    database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
  });

  for (const file of migrationFiles) {
    if (applied.has(file)) continue;
    log.info('Running migration', { file });
    const sql = readFileSync(join(resolvedDir, file), 'utf-8');
    runMigration(file, sql);
    log.info('Migration applied', { file });
  }
}

/**
 * Close the database connection. Call on app quit.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}
