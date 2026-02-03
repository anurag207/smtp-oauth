/**
 * Unit Tests for Crypto Utilities
 *
 * Tests encryption/decryption functionality using AES-256-GCM.
 */

// Mock the config module BEFORE importing crypto
jest.mock('../config', () => ({
  config: {
    // Valid 32-byte hex key for testing (64 hex characters)
    encryptionKey: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  },
}));

import { encrypt, decrypt, isEncrypted } from './crypto';

describe('Crypto Utils', () => {
  describe('encrypt()', () => {
    it('should encrypt a string and return non-empty result', () => {
      const plaintext = 'my-secret-token';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.length).toBeGreaterThan(0);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should return encrypted data in correct format (iv:authTag:ciphertext)', () => {
      const plaintext = 'test-data';
      const encrypted = encrypt(plaintext);

      const parts = encrypted.split(':');
      expect(parts.length).toBe(3);

      // IV should be 24 hex chars (12 bytes)
      expect(parts[0].length).toBe(24);
      // Auth tag should be 32 hex chars (16 bytes)
      expect(parts[1].length).toBe(32);
      // Ciphertext should be non-empty
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should produce different ciphertext for same input (random IV)', () => {
      const plaintext = 'same-input';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Same plaintext should produce different ciphertext due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(3);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
    });
  });

  describe('decrypt()', () => {
    it('should decrypt an encrypted string back to original', () => {
      const plaintext = 'my-secret-token';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should correctly decrypt empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should correctly decrypt special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should correctly decrypt unicode characters', () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should correctly decrypt long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error on invalid format (missing parts)', () => {
      expect(() => decrypt('invalid')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('part1:part2')).toThrow('Invalid encrypted data format');
    });

    it('should throw error on empty string', () => {
      expect(() => decrypt('')).toThrow('Invalid encrypted data format');
    });

    it('should throw error on tampered ciphertext', () => {
      const plaintext = 'test-data';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with the ciphertext
      const tamperedCiphertext = parts[2].replace(/./g, 'x');
      const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw error on tampered auth tag', () => {
      const plaintext = 'test-data';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with the auth tag
      const tamperedAuthTag = 'x'.repeat(32);
      const tampered = `${parts[0]}:${tamperedAuthTag}:${parts[2]}`;

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('isEncrypted()', () => {
    it('should return true for properly encrypted data', () => {
      const encrypted = encrypt('test');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(isEncrypted('plain-text')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('should return false for null-like values', () => {
      expect(isEncrypted(null as unknown as string)).toBe(false);
      expect(isEncrypted(undefined as unknown as string)).toBe(false);
    });

    it('should return false for string with wrong number of parts', () => {
      expect(isEncrypted('one')).toBe(false);
      expect(isEncrypted('one:two')).toBe(false);
      expect(isEncrypted('one:two:three:four')).toBe(false);
    });

    it('should return false for string with wrong IV length', () => {
      // IV should be 24 hex chars (12 bytes), this has 10
      expect(isEncrypted('0123456789:authTag32chars00000000000:ciphertext')).toBe(false);
    });

    it('should return true for string with correct format', () => {
      // 24 char IV : any auth tag : any ciphertext
      expect(isEncrypted('012345678901234567890123:authtag:cipher')).toBe(true);
    });
  });

  describe('encrypt-decrypt roundtrip', () => {
    const testCases = [
      { name: 'OAuth refresh token', value: 'ya29.a0AfH6SMBx...' },
      { name: 'API key format', value: 'sk_test_1234567890abcdef' },
      { name: 'JSON data', value: JSON.stringify({ user: 'test', token: 'abc' }) },
      { name: 'URL', value: 'https://example.com?token=xyz&user=test' },
      { name: 'Multi-line string', value: 'line1\nline2\nline3' },
    ];

    testCases.forEach(({ name, value }) => {
      it(`should handle ${name}`, () => {
        const encrypted = encrypt(value);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(value);
      });
    });
  });
});


