/**
 * SMTP to Gmail OAuth Relay
 *
 * An SMTP server that accepts email via standard SMTP protocol
 * and relays them through Gmail's API using OAuth 2.0.
 *
 * Flow: Email Client → SMTP → This Relay → OAuth → Gmail API → Delivered
 */

// Config must be imported first to validate environment variables
import { config } from './config';

import { createSmtpServer, startSmtpServer, stopSmtpServer } from './smtp/server';
import { initializeDatabase, closeDatabase } from './db';
import { createTables } from './db/schema';
import { createOAuthServer, startOAuthServer } from './oauth/server';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           SMTP to Gmail OAuth Relay                          ║');
  console.log('║           Version 0.3.0                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  console.log('[Server] Initializing database...');
  initializeDatabase(config.databasePath);
  createTables();
  console.log('');

  // Create and start OAuth HTTP server
  console.log('[Server] Starting OAuth server...');
  const oauthServer = createOAuthServer();
  await startOAuthServer(oauthServer);

  // Create and start SMTP server
  console.log('[Server] Starting SMTP server...');
  const smtpConfig = { port: config.smtpPort, host: config.smtpHost };
  const smtpServer = createSmtpServer(smtpConfig);
  await startSmtpServer(smtpServer, smtpConfig);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Server Ready                              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  SMTP Server:   Port ${config.smtpPort}                                   ║`);
  console.log(`║  OAuth Server:  http://localhost:${config.httpPort}                       ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  1. Register Gmail: http://localhost:3000/auth/register      ║');
  console.log('║  2. Get API key and configure your email client              ║');
  console.log('║  3. Send emails through the relay!                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Press Ctrl+C to stop the server.');
  console.log('');

  // Handle graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n[Server] Received shutdown signal...');

    // Stop SMTP server
    stopSmtpServer(smtpServer)
      .then(() => {
        // Close database connection
        closeDatabase();
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
    closeDatabase();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
    closeDatabase();
    process.exit(1);
  });
}

// Start the application
main().catch((err) => {
  console.error('[Server] Failed to start:', err);
  closeDatabase();
  process.exit(1);
});
