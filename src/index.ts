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

import { createSmtpServer, startSmtpServer, stopSmtpServer } from './smtp/smtp-server';
import { initializeDatabase, closeDatabase } from './db';
import { createTables } from './db/accounts-schema';
import { createOAuthServer, startOAuthServer } from './oauth/http-server';
import { serverLogger } from './utils/logger';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  // Display startup banner
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           SMTP to Gmail OAuth Relay                          ║');
  console.log('║           Version 0.4.0                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  serverLogger.info('Initializing database...');
  initializeDatabase(config.databasePath);
  createTables();
  console.log('');

  // Create and start OAuth HTTP server
  serverLogger.info('Starting OAuth server...');
  const oauthServer = createOAuthServer();
  await startOAuthServer(oauthServer);

  // Create and start SMTP server
  serverLogger.info('Starting SMTP server...');
  const smtpConfig = { port: config.smtpPort, host: config.smtpHost };
  const smtpServer = createSmtpServer(smtpConfig);
  await startSmtpServer(smtpServer, smtpConfig);

  // Display ready banner
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Server Ready                              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  SMTP Server:   Port ${config.smtpPort}                                   ║`);
  console.log(`║  OAuth Server:  http://localhost:${config.httpPort}                       ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  1. Register Gmail: http://localhost:3000/auth/register      ║');
  console.log('║  2. Get SMTP Credentials (API Key) and configure your sequencer              ║');
  console.log('║  3. Send emails through the relay!                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  serverLogger.info('Server ready - Press Ctrl+C to stop');
  console.log('');

  // Handle graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    serverLogger.info('Received shutdown signal...');

    // Stop SMTP server
    stopSmtpServer(smtpServer)
      .then(() => {
        // Close database connection
        closeDatabase();
        serverLogger.info('Goodbye!');
        process.exit(0);
      })
      .catch((err) => {
        serverLogger.error('Error during shutdown', { error: err });
        process.exit(1);
      });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    serverLogger.error('Uncaught exception', { error: err });
    closeDatabase();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    serverLogger.error('Unhandled rejection', { reason });
    closeDatabase();
    process.exit(1);
  });
}

// Start the application
main().catch((err) => {
  serverLogger.error('Failed to start', { error: err });
  closeDatabase();
  process.exit(1);
});
