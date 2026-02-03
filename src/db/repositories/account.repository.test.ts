/**
 * Unit Tests for Account Repository
 *
 * Tests database operations for accounts with an in-memory SQLite database.
 * Uses mocked encryption to isolate tests from external dependencies.
 */

import Database from 'better-sqlite3';

// Mock the database module
let mockDb: Database.Database;

jest.mock('../index', () => ({
  getDatabase: () => mockDb,
}));

// Mock the crypto module
jest.mock('../../utils/crypto', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace('encrypted:', ''),
  isEncrypted: (value: string) => value.startsWith('encrypted:'),
}));

// Mock the logger
jest.mock('../../utils/logger', () => ({
  dbLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  createAccount,
  getAccountById,
  getAccountByEmail,
  verifyApiKey,
  getDecryptedRefreshToken,
  getDecryptedAccessToken,
  updateTokens,
  updateRefreshToken,
  updateApiKey,
  deleteAccount,
  accountExists,
  getAllAccounts,
  countAccounts,
} from './account.repository';

describe('Account Repository', () => {
  beforeEach(() => {
    // Create fresh in-memory database for each test
    mockDb = new Database(':memory:');

    // Create the accounts table
    mockDb.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        token_expiry INTEGER,
        api_key TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
  });

  afterEach(() => {
    mockDb.close();
  });

  describe('createAccount()', () => {
    it('should create a new account with hashed API key and encrypted token', () => {
      const account = createAccount({
        email: 'test@example.com',
        refreshToken: 'refresh-token-123',
        apiKey: 'sk_test123',
      });

      expect(account).toBeDefined();
      expect(account.email).toBe('test@example.com');
      expect(account.id).toBeGreaterThan(0);

      // API key should be hashed (bcrypt hash starts with $2)
      expect(account.api_key).toMatch(/^\$2[aby]\$/);

      // Refresh token should be encrypted
      expect(account.refresh_token).toBe('encrypted:refresh-token-123');
    });

    it('should throw error on duplicate email', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token1',
        apiKey: 'key1',
      });

      expect(() =>
        createAccount({
          email: 'test@example.com',
          refreshToken: 'token2',
          apiKey: 'key2',
        })
      ).toThrow();
    });

    it('should create multiple accounts with different emails', () => {
      const account1 = createAccount({
        email: 'user1@example.com',
        refreshToken: 'token1',
        apiKey: 'key1',
      });

      const account2 = createAccount({
        email: 'user2@example.com',
        refreshToken: 'token2',
        apiKey: 'key2',
      });

      expect(account1.id).not.toBe(account2.id);
      expect(account1.email).toBe('user1@example.com');
      expect(account2.email).toBe('user2@example.com');
    });
  });

  describe('getAccountById()', () => {
    it('should return account when found', () => {
      const created = createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      const found = getAccountById(created.id);

      expect(found).not.toBeNull();
      expect(found!.email).toBe('test@example.com');
    });

    it('should return null when not found', () => {
      const found = getAccountById(99999);
      expect(found).toBeNull();
    });
  });

  describe('getAccountByEmail()', () => {
    it('should return account when found', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      const found = getAccountByEmail('test@example.com');

      expect(found).not.toBeNull();
      expect(found!.email).toBe('test@example.com');
    });

    it('should return null when not found', () => {
      const found = getAccountByEmail('nonexistent@example.com');
      expect(found).toBeNull();
    });

    it('should be case-sensitive', () => {
      createAccount({
        email: 'Test@Example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      expect(getAccountByEmail('Test@Example.com')).not.toBeNull();
      expect(getAccountByEmail('test@example.com')).toBeNull();
    });
  });

  describe('verifyApiKey()', () => {
    it('should return account when API key is valid', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'sk_test123',
      });

      const account = verifyApiKey('test@example.com', 'sk_test123');

      expect(account).not.toBeNull();
      expect(account!.email).toBe('test@example.com');
    });

    it('should return null when API key is invalid', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'sk_correct',
      });

      const account = verifyApiKey('test@example.com', 'sk_wrong');

      expect(account).toBeNull();
    });

    it('should return null when email not found', () => {
      const account = verifyApiKey('nonexistent@example.com', 'any_key');
      expect(account).toBeNull();
    });

    it('should work with different API keys for different accounts', () => {
      createAccount({
        email: 'user1@example.com',
        refreshToken: 'token1',
        apiKey: 'sk_key1',
      });

      createAccount({
        email: 'user2@example.com',
        refreshToken: 'token2',
        apiKey: 'sk_key2',
      });

      expect(verifyApiKey('user1@example.com', 'sk_key1')).not.toBeNull();
      expect(verifyApiKey('user1@example.com', 'sk_key2')).toBeNull();
      expect(verifyApiKey('user2@example.com', 'sk_key2')).not.toBeNull();
      expect(verifyApiKey('user2@example.com', 'sk_key1')).toBeNull();
    });
  });

  describe('getDecryptedRefreshToken()', () => {
    it('should decrypt encrypted refresh token', () => {
      const account = createAccount({
        email: 'test@example.com',
        refreshToken: 'my-refresh-token',
        apiKey: 'key',
      });

      const decrypted = getDecryptedRefreshToken(account);

      expect(decrypted).toBe('my-refresh-token');
    });
  });

  describe('getDecryptedAccessToken()', () => {
    it('should return null when access token is not set', () => {
      const account = createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      const decrypted = getDecryptedAccessToken(account);

      expect(decrypted).toBeNull();
    });

    it('should decrypt encrypted access token', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      // Update with access token
      updateTokens('test@example.com', 'my-access-token', Date.now() + 3600);

      // Re-fetch account to get updated token
      const updatedAccount = getAccountByEmail('test@example.com')!;
      const decrypted = getDecryptedAccessToken(updatedAccount);

      expect(decrypted).toBe('my-access-token');
    });
  });

  describe('updateTokens()', () => {
    it('should update access token and expiry', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      const expiry = Math.floor(Date.now() / 1000) + 3600;
      updateTokens('test@example.com', 'new-access-token', expiry);

      const account = getAccountByEmail('test@example.com')!;

      expect(account.access_token).toBe('encrypted:new-access-token');
      expect(account.token_expiry).toBe(expiry);
    });

    it('should throw error when account not found', () => {
      expect(() =>
        updateTokens('nonexistent@example.com', 'token', 12345)
      ).toThrow('Account not found');
    });
  });

  describe('updateRefreshToken()', () => {
    it('should update refresh token', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'old-token',
        apiKey: 'key',
      });

      updateRefreshToken('test@example.com', 'new-refresh-token');

      const account = getAccountByEmail('test@example.com')!;

      expect(account.refresh_token).toBe('encrypted:new-refresh-token');
    });

    it('should throw error when account not found', () => {
      expect(() =>
        updateRefreshToken('nonexistent@example.com', 'token')
      ).toThrow('Account not found');
    });
  });

  describe('updateApiKey()', () => {
    it('should update API key with new hash', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'old-key',
      });

      updateApiKey('test@example.com', 'new-key');

      // Old key should no longer work
      expect(verifyApiKey('test@example.com', 'old-key')).toBeNull();

      // New key should work
      expect(verifyApiKey('test@example.com', 'new-key')).not.toBeNull();
    });

    it('should throw error when account not found', () => {
      expect(() =>
        updateApiKey('nonexistent@example.com', 'key')
      ).toThrow('Account not found');
    });
  });

  describe('deleteAccount()', () => {
    it('should delete existing account and return true', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      const result = deleteAccount('test@example.com');

      expect(result).toBe(true);
      expect(getAccountByEmail('test@example.com')).toBeNull();
    });

    it('should return false when account not found', () => {
      const result = deleteAccount('nonexistent@example.com');
      expect(result).toBe(false);
    });
  });

  describe('accountExists()', () => {
    it('should return true when account exists', () => {
      createAccount({
        email: 'test@example.com',
        refreshToken: 'token',
        apiKey: 'key',
      });

      expect(accountExists('test@example.com')).toBe(true);
    });

    it('should return false when account does not exist', () => {
      expect(accountExists('nonexistent@example.com')).toBe(false);
    });
  });

  describe('getAllAccounts()', () => {
    it('should return empty array when no accounts', () => {
      const accounts = getAllAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return all accounts', () => {
      createAccount({
        email: 'user1@example.com',
        refreshToken: 'token1',
        apiKey: 'key1',
      });

      createAccount({
        email: 'user2@example.com',
        refreshToken: 'token2',
        apiKey: 'key2',
      });

      const accounts = getAllAccounts();

      expect(accounts.length).toBe(2);
      // Check both accounts exist (order may vary in memory DB)
      const emails = accounts.map((a) => a.email);
      expect(emails).toContain('user1@example.com');
      expect(emails).toContain('user2@example.com');
    });
  });

  describe('countAccounts()', () => {
    it('should return 0 when no accounts', () => {
      expect(countAccounts()).toBe(0);
    });

    it('should return correct count', () => {
      createAccount({
        email: 'user1@example.com',
        refreshToken: 'token1',
        apiKey: 'key1',
      });

      expect(countAccounts()).toBe(1);

      createAccount({
        email: 'user2@example.com',
        refreshToken: 'token2',
        apiKey: 'key2',
      });

      expect(countAccounts()).toBe(2);
    });
  });
});

