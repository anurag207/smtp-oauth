/**
 * Configuration Module
 *
 * Loads and validates environment variables using Zod.
 * Fails fast with clear error messages if configuration is invalid.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Configuration schema with validation rules
 */
const configSchema = z.object({
  // Google OAuth credentials (required for Gmail API)
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

  // SMTP Server configuration
  smtpPort: z.coerce
    .number()
    .int()
    .min(1, 'SMTP_PORT must be between 1 and 65535')
    .max(65535, 'SMTP_PORT must be between 1 and 65535')
    .default(2525),

  smtpHost: z.string().default('0.0.0.0'),

  // OAuth HTTP Server configuration
  httpPort: z.coerce
    .number()
    .int()
    .min(1, 'HTTP_PORT must be between 1 and 65535')
    .max(65535, 'HTTP_PORT must be between 1 and 65535')
    .default(3000),

  // Database configuration
  databasePath: z.string().default('./data/relay.db'),
});

/**
 * Configuration type (auto-generated from schema)
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): Config {
  const result = configSchema.safeParse({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    smtpPort: process.env.SMTP_PORT,
    smtpHost: process.env.SMTP_HOST,
    httpPort: process.env.HTTP_PORT,
    databasePath: process.env.DATABASE_PATH,
  });

  if (!result.success) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║              ❌ Configuration Error                           ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('The following configuration errors were found:');
    console.error('');

    const errors = result.error.issues;
    errors.forEach((err) => {
      const path = err.path.join('.') || 'unknown';
      console.error(`  • ${path}: ${err.message}`);
    });

    console.error('');
    console.error('Please check your .env file and ensure all required variables are set.');
    console.error('See .env.example for reference.');
    console.error('');

    process.exit(1);
  }

  return result.data;
}

/**
 * Validated configuration object
 * This is loaded once at startup and exported for use throughout the app
 */
export const config = loadConfig();
