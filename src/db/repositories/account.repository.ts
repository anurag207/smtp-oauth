/**
 * Account Repository
 *
 * Handles all database operations for the accounts table.
 * Provides CRUD operations for managing registered Gmail accounts.
 */

import { getDatabase } from '../index';

/**
 * Account data structure matching the database schema
 */
export interface Account {
  id: number;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_expiry: number | null;
  api_key: string;
  created_at: number;
  updated_at: number;
}

/**
 * Data required to create a new account
 */
export interface CreateAccountData {
  email: string;
  refreshToken: string;
  apiKey: string;
}

/**
 * Create a new account in the database
 *
 * @param data - Account data (email, refreshToken, apiKey)
 * @returns The created account
 * @throws Error if email or apiKey already exists
 */
export function createAccount(data: CreateAccountData): Account {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO accounts (email, refresh_token, api_key)
    VALUES (@email, @refreshToken, @apiKey)
  `);

  const result = stmt.run({
    email: data.email,
    refreshToken: data.refreshToken,
    apiKey: data.apiKey,
  });

  console.log(`[DB] Created account for: ${data.email}`);

  const account = getAccountById(result.lastInsertRowid as number);
  if (!account) {
    throw new Error('Failed to retrieve created account');
  }

  return account;
}

/**
 * Get account by ID
 *
 * @param id - Account ID
 * @returns Account or null if not found
 */
export function getAccountById(id: number): Account | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
  const row = stmt.get(id) as Account | undefined;

  return row ?? null;
}

/**
 * Get account by email address
 *
 * @param email - Email address to look up
 * @returns Account or null if not found
 */
export function getAccountByEmail(email: string): Account | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM accounts WHERE email = ?');
  const row = stmt.get(email) as Account | undefined;

  return row ?? null;
}

/**
 * Get account by API key (used for SMTP authentication)
 *
 * @param apiKey - API key to look up
 * @returns Account or null if not found
 */
export function getAccountByApiKey(apiKey: string): Account | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM accounts WHERE api_key = ?');
  const row = stmt.get(apiKey) as Account | undefined;

  return row ?? null;
}

/**
 * Update OAuth tokens for an account
 *
 * @param email - Email address of the account
 * @param accessToken - New access token
 * @param tokenExpiry - Token expiry timestamp (Unix seconds)
 */
export function updateTokens(
  email: string,
  accessToken: string,
  tokenExpiry: number
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE accounts 
    SET access_token = ?, token_expiry = ?, updated_at = unixepoch()
    WHERE email = ?
  `);

  const result = stmt.run(accessToken, tokenExpiry, email);

  if (result.changes === 0) {
    throw new Error(`Account not found: ${email}`);
  }

  console.log(`[DB] Updated tokens for: ${email}`);
}

/**
 * Update refresh token for an account
 *
 * @param email - Email address of the account
 * @param refreshToken - New refresh token
 */
export function updateRefreshToken(
  email: string,
  refreshToken: string
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE accounts 
    SET refresh_token = ?, updated_at = unixepoch()
    WHERE email = ?
  `);

  const result = stmt.run(refreshToken, email);

  if (result.changes === 0) {
    throw new Error(`Account not found: ${email}`);
  }

  console.log(`[DB] Updated refresh token for: ${email}`);
}

/**
 * Delete an account from the database
 *
 * @param email - Email address of the account to delete
 * @returns true if deleted, false if not found
 */
export function deleteAccount(email: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM accounts WHERE email = ?');
  const result = stmt.run(email);

  if (result.changes > 0) {
    console.log(`[DB] Deleted account: ${email}`);
    return true;
  }

  return false;
}

/**
 * Check if an account exists by email
 *
 * @param email - Email address to check
 * @returns true if account exists
 */
export function accountExists(email: string): boolean {
  return getAccountByEmail(email) !== null;
}

/**
 * Get all accounts (for debugging/admin purposes)
 *
 * @returns Array of all accounts
 */
export function getAllAccounts(): Account[] {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC');
  return stmt.all() as Account[];
}

/**
 * Count total number of accounts
 *
 * @returns Number of registered accounts
 */
export function countAccounts(): number {
  const db = getDatabase();

  const stmt = db.prepare('SELECT COUNT(*) as count FROM accounts');
  const result = stmt.get() as { count: number };

  return result.count;
}

