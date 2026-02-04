/**
 * Account Repository
 *
 * Handles all database operations for the accounts table.
 * Provides CRUD operations for managing registered Gmail accounts.
 *
 * Security features:
 * - API keys are stored as bcrypt hashes (can only verify, not retrieve)
 * - OAuth tokens are encrypted at rest using AES-256-GCM
 */

import { getDatabase } from '../index';
import bcrypt from 'bcrypt';
import { encrypt, decrypt, isEncrypted } from '../../utils/crypto';
import { dbLogger } from '../../utils/logger';

const BCRYPT_ROUNDS = 10;

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
 * Security: API key is hashed with bcrypt, refresh token is encrypted with AES-256
 *
 * @param data - Account data (email, refreshToken, apiKey - all in plain text)
 * @returns The created account
 * @throws Error if email or apiKey already exists
 */
export function createAccount(data: CreateAccountData): Account {
  const db = getDatabase();

  // Hash the API key (one-way, can only verify later)
  const hashedApiKey = bcrypt.hashSync(data.apiKey, BCRYPT_ROUNDS);

  // Encrypt the refresh token (reversible, for use with Google API)
  const encryptedRefreshToken = encrypt(data.refreshToken);

  const stmt = db.prepare(`
    INSERT INTO accounts (email, refresh_token, api_key)
    VALUES (@email, @refreshToken, @apiKey)
  `);

  const result = stmt.run({
    email: data.email,
    refreshToken: encryptedRefreshToken,
    apiKey: hashedApiKey,
  });

  dbLogger.info(`Created account: ${data.email} (API key hashed, tokens encrypted)`);

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
 * Verify API key for an account (for hashed keys)
 *
 * Since API keys are hashed, we can't look them up directly.
 * Instead, we look up by email and verify the hash.
 *
 * @param email - Email address of the account
 * @param apiKey - Plain text API key to verify
 * @returns Account if valid, null if not found or invalid key
 */
export function verifyApiKey(email: string, apiKey: string): Account | null {
  const account = getAccountByEmail(email);

  if (!account) {
    return null;
  }

  // Check if the stored API key is a bcrypt hash (starts with $2)
  const isHashed = account.api_key.startsWith('$2');

  if (isHashed) {
    // Verify against bcrypt hash
    const isValid = bcrypt.compareSync(apiKey, account.api_key);
    return isValid ? account : null;
  } else {
    // Legacy: plain text comparison (for existing accounts)
    return account.api_key === apiKey ? account : null;
  }
}

/**
 * Get decrypted refresh token for an account
 *
 * @param account - Account object
 * @returns Decrypted refresh token
 */
export function getDecryptedRefreshToken(account: Account): string {
  if (isEncrypted(account.refresh_token)) {
    return decrypt(account.refresh_token);
  }
  // Legacy: return as-is if not encrypted
  return account.refresh_token;
}

/**
 * Get decrypted access token for an account
 *
 * @param account - Account object
 * @returns Decrypted access token or null if not set
 */
export function getDecryptedAccessToken(account: Account): string | null {
  if (!account.access_token) {
    return null;
  }
  if (isEncrypted(account.access_token)) {
    return decrypt(account.access_token);
  }
  // Legacy: return as-is if not encrypted
  return account.access_token;
}

/**
 * Update OAuth tokens for an account
 *
 * Security: Access token is encrypted before storing
 *
 * @param email - Email address of the account
 * @param accessToken - New access token (plain text, will be encrypted)
 * @param tokenExpiry - Token expiry timestamp (Unix seconds)
 */
export function updateAccessToken(
  email: string,
  accessToken: string,
  tokenExpiry: number
): void {
  const db = getDatabase();

  // Encrypt the access token before storing
  const encryptedAccessToken = encrypt(accessToken);

  const stmt = db.prepare(`
    UPDATE accounts 
    SET access_token = ?, token_expiry = ?, updated_at = unixepoch()
    WHERE email = ?
  `);

  const result = stmt.run(encryptedAccessToken, tokenExpiry, email);

  if (result.changes === 0) {
    throw new Error(`Account not found: ${email}`);
  }

  dbLogger.debug(`Updated tokens for: ${email}`);
}

/**
 * Update refresh token for an account
 *
 * Security: Refresh token is encrypted before storing
 *
 * @param email - Email address of the account
 * @param refreshToken - New refresh token (plain text, will be encrypted)
 */
export function updateRefreshToken(
  email: string,
  refreshToken: string
): void {
  const db = getDatabase();

  // Encrypt the refresh token before storing
  const encryptedRefreshToken = encrypt(refreshToken);

  const stmt = db.prepare(`
    UPDATE accounts 
    SET refresh_token = ?, updated_at = unixepoch()
    WHERE email = ?
  `);

  const result = stmt.run(encryptedRefreshToken, email);

  if (result.changes === 0) {
    throw new Error(`Account not found: ${email}`);
  }

  dbLogger.debug(`Updated refresh token for: ${email}`);
}

/**
 * Update API key for an account (for regeneration)
 *
 * Security: New API key is hashed with bcrypt before storing
 *
 * @param email - Email address of the account
 * @param apiKey - New API key (plain text, will be hashed)
 */
export function updateApiKey(email: string, apiKey: string): void {
  const db = getDatabase();

  // Hash the new API key
  const hashedApiKey = bcrypt.hashSync(apiKey, BCRYPT_ROUNDS);

  const stmt = db.prepare(`
    UPDATE accounts 
    SET api_key = ?, updated_at = unixepoch()
    WHERE email = ?
  `);

  const result = stmt.run(hashedApiKey, email);

  if (result.changes === 0) {
    throw new Error(`Account not found: ${email}`);
  }

  dbLogger.info(`Regenerated API key for: ${email}`);
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
    dbLogger.info(`Deleted account: ${email}`);
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

