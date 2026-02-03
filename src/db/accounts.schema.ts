/**
 * Accounts Database Schema
 *
 * Defines and creates the accounts table for storing OAuth credentials.
 * Tables are created if they don't exist.
 */

import { getDatabase } from './index';

/**
 * Create all required database tables
 * Tables are only created if they don't already exist.
 */
export function createTables(): void {
  const db = getDatabase();

  // Create accounts table for storing OAuth credentials
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      token_expiry INTEGER,
      api_key TEXT UNIQUE NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Create indexes for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
    CREATE INDEX IF NOT EXISTS idx_accounts_api_key ON accounts(api_key);
  `);

  console.log('[DB] Database tables created/verified');
}

/**
 * Drop all tables ( for testing only)
 */
export function dropTables(): void {
  const db = getDatabase();

  db.exec(`
    DROP TABLE IF EXISTS accounts;
  `);

  console.log('[DB] All tables dropped');
}

