/**
 * Unit Tests for Configuration Validation
 *
 * Tests the Zod schema validation for environment variables.
 * Note: We test the schema directly rather than the loadConfig function
 * because it calls process.exit on failure.
 */

import { z } from 'zod';

// Recreate the schema here for testing (to avoid side effects from config import)
const configSchema = z.object({
  googleClientId: z
    .string({ message: 'GOOGLE_CLIENT_ID is required' })
    .min(1, 'GOOGLE_CLIENT_ID cannot be empty'),

  googleClientSecret: z
    .string({ message: 'GOOGLE_CLIENT_SECRET is required' })
    .min(1, 'GOOGLE_CLIENT_SECRET cannot be empty'),

  googleRedirectUri: z
    .string()
    .url('GOOGLE_REDIRECT_URI must be a valid URL')
    .default('http://localhost:3000/auth/callback'),

  smtpPort: z.coerce
    .number()
    .int()
    .min(1, 'SMTP_PORT must be between 1 and 65535')
    .max(65535, 'SMTP_PORT must be between 1 and 65535')
    .default(2525),

  smtpHost: z.string().default('0.0.0.0'),

  httpPort: z.coerce
    .number()
    .int()
    .min(1, 'HTTP_PORT must be between 1 and 65535')
    .max(65535, 'HTTP_PORT must be between 1 and 65535')
    .default(3000),

  databasePath: z.string().default('./data/relay.db'),

  encryptionKey: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    .regex(/^[a-fA-F0-9]+$/, 'ENCRYPTION_KEY must be a valid hex string'),
});

// Valid config for testing
const validConfig = {
  googleClientId: 'test-client-id',
  googleClientSecret: 'test-client-secret',
  googleRedirectUri: 'http://localhost:3000/auth/callback',
  smtpPort: 2525,
  smtpHost: '0.0.0.0',
  httpPort: 3000,
  databasePath: './data/relay.db',
  encryptionKey: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
};

describe('Config Schema Validation', () => {
  describe('Valid configurations', () => {
    it('should accept a fully valid configuration', () => {
      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should use default values when optional fields are missing', () => {
      const minimalConfig = {
        googleClientId: 'test-id',
        googleClientSecret: 'test-secret',
        encryptionKey: validConfig.encryptionKey,
      };

      const result = configSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.smtpPort).toBe(2525);
        expect(result.data.httpPort).toBe(3000);
        expect(result.data.smtpHost).toBe('0.0.0.0');
        expect(result.data.databasePath).toBe('./data/relay.db');
        expect(result.data.googleRedirectUri).toBe('http://localhost:3000/auth/callback');
      }
    });

    it('should coerce string port numbers to integers', () => {
      const configWithStringPorts = {
        ...validConfig,
        smtpPort: '8025',
        httpPort: '8080',
      };

      const result = configSchema.safeParse(configWithStringPorts);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.smtpPort).toBe(8025);
        expect(result.data.httpPort).toBe(8080);
      }
    });
  });

  describe('Google OAuth validation', () => {
    it('should reject missing GOOGLE_CLIENT_ID', () => {
      const { googleClientId, ...configWithoutId } = validConfig;
      const result = configSchema.safeParse(configWithoutId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('googleClientId'))).toBe(true);
      }
    });

    it('should reject empty GOOGLE_CLIENT_ID', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        googleClientId: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing GOOGLE_CLIENT_SECRET', () => {
      const { googleClientSecret, ...configWithoutSecret } = validConfig;
      const result = configSchema.safeParse(configWithoutSecret);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('googleClientSecret'))).toBe(true);
      }
    });

    it('should reject invalid redirect URI', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        googleRedirectUri: 'not-a-url',
      });

      expect(result.success).toBe(false);
    });

    it('should accept valid redirect URI', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        googleRedirectUri: 'https://example.com/oauth/callback',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Port validation', () => {
    it('should reject SMTP port below 1', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        smtpPort: 0,
      });

      expect(result.success).toBe(false);
    });

    it('should reject SMTP port above 65535', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        smtpPort: 65536,
      });

      expect(result.success).toBe(false);
    });

    it('should accept valid SMTP port', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        smtpPort: 25,
      });

      expect(result.success).toBe(true);
    });

    it('should reject HTTP port below 1', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        httpPort: 0,
      });

      expect(result.success).toBe(false);
    });

    it('should reject HTTP port above 65535', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        httpPort: 70000,
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-integer port', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        smtpPort: 25.5,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Encryption key validation', () => {
    it('should reject encryption key shorter than 64 characters', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        encryptionKey: 'tooshort',
      });

      expect(result.success).toBe(false);
    });

    it('should reject encryption key longer than 64 characters', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        encryptionKey: 'a'.repeat(65),
      });

      expect(result.success).toBe(false);
    });

    it('should reject encryption key with non-hex characters', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        encryptionKey: 'g'.repeat(64), // 'g' is not a hex character
      });

      expect(result.success).toBe(false);
    });

    it('should accept valid 64-character hex encryption key', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        encryptionKey: 'abcdef0123456789'.repeat(4), // 64 hex chars
      });

      expect(result.success).toBe(true);
    });

    it('should accept uppercase hex characters', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        encryptionKey: 'ABCDEF0123456789'.repeat(4),
      });

      expect(result.success).toBe(true);
    });

    it('should accept mixed case hex characters', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        encryptionKey: 'AbCdEf0123456789'.repeat(4),
      });

      expect(result.success).toBe(true);
    });

    it('should reject missing encryption key', () => {
      const { encryptionKey, ...configWithoutKey } = validConfig;
      const result = configSchema.safeParse(configWithoutKey);

      expect(result.success).toBe(false);
    });
  });

  describe('Database path validation', () => {
    it('should accept custom database path', () => {
      const result = configSchema.safeParse({
        ...validConfig,
        databasePath: '/custom/path/db.sqlite',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databasePath).toBe('/custom/path/db.sqlite');
      }
    });

    it('should use default database path when not specified', () => {
      const { databasePath, ...configWithoutPath } = validConfig;
      const result = configSchema.safeParse(configWithoutPath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databasePath).toBe('./data/relay.db');
      }
    });
  });
});

