/**
 * SMTP Server Module
 *
 * Creates and manages an SMTP server that accepts incoming email connections.
 * Currently prints received emails to console; will be extended to relay via Gmail API.
 */

import { SMTPServer, SMTPServerDataStream, SMTPServerSession } from 'smtp-server';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';

/**
 * Configuration options for the SMTP server
 */
export interface SmtpServerConfig {
  port: number;
  host: string;
}

/**
 * Parsed email data structure
 */
export interface ParsedEmailData {
  from: string;
  to: string;
  subject: string;
  body: string;
  date: Date | undefined;
}

/**
 * Creates an SMTP server instance with the specified configuration
 *
 * @param config - Server configuration (port and host)
 * @returns Configured SMTPServer instance
 */
export function createSmtpServer(_config: SmtpServerConfig): SMTPServer {
  const server = new SMTPServer({
    // Authentication is optional
    authOptional: true,

    // Disable STARTTLS for local development (no SSL certificate needed)
    disabledCommands: ['STARTTLS'],

    // Log successful authentication attempts
    onAuth(auth, _session, callback) {
      console.log(`[SMTP] Auth attempt - User: ${auth.username}`);
      // Accept all auth for now; will validate against DB later
      callback(null, { user: auth.username });
    },

    // Handle incoming email data
    onData(
      stream: SMTPServerDataStream,
      session: SMTPServerSession,
      callback: (err?: Error | null) => void
    ) {
      handleIncomingEmail(stream, session)
        .then(() => {
          callback(); // Success - sends "250 OK" to client
        })
        .catch((err: Error) => {
          console.error('[SMTP] Error processing email:', err.message);
          callback(err); // Failure - sends error to client
        });
    },

    // Log client connections
    onConnect(
      session: SMTPServerSession,
      callback: (err?: Error | null) => void
    ) {
      console.log(`[SMTP] Client connected from ${session.remoteAddress}`);
      callback(); // Accept the connection
    },

    // Log client disconnections
    onClose(session: SMTPServerSession) {
      console.log(`[SMTP] Client disconnected: ${session.remoteAddress}`);
    },
  });

  return server;
}

/**
 * Handles an incoming email by parsing it and printing to console
 *
 * @param stream - The email data stream
 * @param session - The SMTP session information
 */
async function handleIncomingEmail(
  stream: SMTPServerDataStream,
  session: SMTPServerSession
): Promise<void> {
  try {
    // Parse the raw email stream into structured data
    const parsed: ParsedMail = await simpleParser(stream);

    // Extract email data
    const emailData: ParsedEmailData = {
      from: parsed.from?.text || 'unknown',
      to: Array.isArray(parsed.to)
        ? parsed.to.map((addr: AddressObject) => addr.text).join(', ')
        : parsed.to?.text || 'unknown',
      subject: parsed.subject || '(no subject)',
      body: parsed.text || parsed.html || '(empty body)',
      date: parsed.date,
    };

    // Print email to console
    printEmail(emailData, session);

    console.log('[SMTP] Email processed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SMTP] Failed to parse email: ${errorMessage}`);
    throw new Error(`Failed to process email: ${errorMessage}`);
  }
}

/**
 * Prints parsed email data to console in a formatted way
 *
 * @param email - The parsed email data
 * @param session - The SMTP session information
 */
function printEmail(email: ParsedEmailData, session: SMTPServerSession): void {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     INCOMING EMAIL                           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Client:  ${session.remoteAddress}`);
  console.log(`║ From:    ${email.from}`);
  console.log(`║ To:      ${email.to}`);
  console.log(`║ Subject: ${email.subject}`);
  console.log(`║ Date:    ${email.date?.toISOString() || 'unknown'}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ Body:');
  console.log('╟──────────────────────────────────────────────────────────────');

  // Print body with indentation
  const bodyLines = email.body.split('\n');
  bodyLines.forEach((line) => {
    console.log(`║ ${line}`);
  });

  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

/**
 * Starts the SMTP server and begins listening for connections
 *
 * @param server - The SMTP server instance
 * @param config - Server configuration
 * @returns Promise that resolves when server is listening
 */
export function startSmtpServer(
  server: SMTPServer,
  config: SmtpServerConfig
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(config.port, config.host, () => {
      console.log(`[SMTP] Server listening on ${config.host}:${config.port}`);
      resolve();
    });

    server.on('error', (err: Error) => {
      console.error('[SMTP] Server error:', err.message);
      reject(err);
    });
  });
}

/**
 * Gracefully stops the SMTP server
 *
 * @param server - The SMTP server instance
 * @returns Promise that resolves when server is closed
 */
export function stopSmtpServer(server: SMTPServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('[SMTP] Server stopped');
      resolve();
    });
  });
}

