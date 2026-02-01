/**
 * SMTP to Gmail OAuth Relay
 *
 * An SMTP server that accepts email via standard SMTP protocol
 * and relays them through Gmail's API using OAuth 2.0.
 *
 * Flow: Email Client → SMTP → This Relay → OAuth → Gmail API → Delivered
 */

import dotenv from 'dotenv';
import { createSmtpServer, startSmtpServer, stopSmtpServer } from './smtp/server';

// Load environment variables from .env file
dotenv.config();

// Server configuration from environment variables
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '2525', 10);
const SMTP_HOST = process.env.SMTP_HOST || '0.0.0.0';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           SMTP to Gmail OAuth Relay                          ║');
  console.log('║           Version 0.1.0                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Create SMTP server
  const smtpConfig = { port: SMTP_PORT, host: SMTP_HOST };
  const smtpServer = createSmtpServer(smtpConfig);

  // Start SMTP server
  await startSmtpServer(smtpServer, smtpConfig);

  console.log('');
  console.log('Server is ready to receive emails.');
  console.log('Send a test email to see it printed in the console.');
  console.log('');
  console.log('Test with: npx ts-node scripts/send-test.ts <to> <subject> <body>');
  console.log('Press Ctrl+C to stop the server.');
  console.log('');

  // Handle graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n[Server] Received shutdown signal...');
    stopSmtpServer(smtpServer)
      .then(() => {
        console.log('[Server] Goodbye!');
        process.exit(0);
      })
      .catch((err) => {
        console.error('[Server] Error during shutdown:', err);
        process.exit(1);
      });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
    process.exit(1);
  });
}

// Start the application
main().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
