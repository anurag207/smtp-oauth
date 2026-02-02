/**
 * SMTP Server Module
 *
 * Creates and manages an SMTP server that accepts incoming email connections.
 * Authenticates users via API key and relays emails through Gmail API.
 */

import {
  SMTPServer,
  SMTPServerDataStream,
  SMTPServerSession,
  SMTPServerAuthentication,
} from 'smtp-server';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { getAccountByApiKey, getAccountByEmail, Account } from '../db/repositories/account.repository';
import { sendEmailViaGmail, EmailMessage, SendEmailResult } from '../gmail/client';

/**
 * Configuration options for the SMTP server
 */
export interface SmtpServerConfig {
  port: number;
  host: string;
}

/**
 * Extended SMTP session with authentication data
 *
 * We extend the base session to store authenticated user info
 */
interface AuthenticatedSession extends SMTPServerSession {
  /** API key used for authentication (stored after successful auth) */
  apiKey?: string;
  /** Email address of the authenticated user */
  userEmail?: string;
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
 * Authentication callback type for smtp-server
 */
type AuthCallback = (
  err: Error | null,
  response?: { user: string }
) => void;

/**
 * Data callback type for smtp-server
 */
type DataCallback = (err?: Error | null) => void;

/**
 * Connect callback type for smtp-server
 */
type ConnectCallback = (err?: Error | null) => void;

/**
 * Creates an SMTP server instance with the specified configuration
 *
 * @param _config - Server configuration (port and host)
 * @returns Configured SMTPServer instance
 */
export function createSmtpServer(_config: SmtpServerConfig): SMTPServer {
  const server = new SMTPServer({
    // Require authentication for all connections
    authOptional: false,

    // Supported authentication methods
    authMethods: ['PLAIN', 'LOGIN'],

    // Disable STARTTLS for local development (no SSL certificate needed)
    disabledCommands: ['STARTTLS'],

    /**
     * Handle authentication attempts
     *
     * Validates the API key against the database and stores
     * authentication info in the session for later use.
     */
    onAuth(
      auth: SMTPServerAuthentication,
      session: AuthenticatedSession,
      callback: AuthCallback
    ): void {
      console.log(`[SMTP] Auth attempt - User: ${auth.username}`);

      // Validate credentials
      // username = email address
      // password = API key (sk_xxx...)
      const username = auth.username || '';
      const password = auth.password || '';

      if (!username || !password) {
        console.log('[SMTP] Auth failed: Missing credentials');
        callback(new Error('Username and password are required'));
        return;
      }

      // Look up account by API key
      const account: Account | null = getAccountByApiKey(password);

      if (!account) {
        // API key not found - give a more helpful message
        // Check if the email is registered at all
        const accountByEmail = getAccountByEmail(username);

        if (!accountByEmail) {
          console.log('[SMTP] Auth failed: Account not registered');
          callback(new Error('Account not registered. Please register at /auth/register'));
        } else {
          console.log('[SMTP] Auth failed: Invalid API key for registered account');
          callback(new Error('Invalid API key'));
        }
        return;
      }

      // Verify email matches the account
      if (account.email.toLowerCase() !== username.toLowerCase()) {
        console.log('[SMTP] Auth failed: Email does not match API key');
        callback(new Error('Email does not match the API key'));
        return;
      }

      // Store authentication info in session for use in onData
      session.apiKey = password;
      session.userEmail = account.email;

      console.log(`[SMTP] Auth successful: ${account.email}`);
      callback(null, { user: account.email });
    },

    /**
     * Handle incoming email data
     *
     * Parses the email, validates authentication, and sends via Gmail API.
     */
    onData(
      stream: SMTPServerDataStream,
      session: AuthenticatedSession,
      callback: DataCallback
    ): void {
      handleIncomingEmail(stream, session)
        .then(() => {
          callback(); // Success - sends "250 OK" to client
        })
        .catch((err: Error) => {
          console.error('[SMTP] Error processing email:', err.message);
          callback(err); // Failure - sends error to client
        });
    },

    /**
     * Log client connections
     */
    onConnect(
      session: SMTPServerSession,
      callback: ConnectCallback
    ): void {
      console.log(`[SMTP] Client connected from ${session.remoteAddress}`);
      callback(); // Accept the connection
    },

    /**
     * Log client disconnections
     */
    onClose(session: SMTPServerSession): void {
      console.log(`[SMTP] Client disconnected: ${session.remoteAddress}`);
    },
  });

  return server;
}

/**
 * Handles an incoming email by parsing it and sending via Gmail API
 *
 * @param stream - The email data stream
 * @param session - The authenticated SMTP session
 */
async function handleIncomingEmail(
  stream: SMTPServerDataStream,
  session: AuthenticatedSession
): Promise<void> {
  // Verify authentication
  const apiKey = session.apiKey;
  const userEmail = session.userEmail;

  if (!apiKey || !userEmail) {
    throw new Error('Not authenticated - missing API key or email');
  }

  try {
    // Parse the raw email stream into structured data
    const parsed: ParsedMail = await simpleParser(stream);

    // Extract email data for display
    const emailData: ParsedEmailData = {
      from: parsed.from?.text || userEmail,
      to: extractRecipients(parsed.to),
      subject: parsed.subject || '(no subject)',
      body: parsed.text || parsed.html || '(empty body)',
      date: parsed.date,
    };

    // Print incoming email details
    printIncomingEmail(emailData, session);

    // Build message for Gmail API
    const message: EmailMessage = {
      from: userEmail, // Always use authenticated email
      to: emailData.to,
      subject: emailData.subject,
      text: parsed.text || '',
      html: parsed.html || undefined,
    };

    // Validate we have a recipient
    if (!message.to) {
      throw new Error('No recipient specified');
    }

    // Send via Gmail API
    console.log('[SMTP] Relaying email via Gmail API...');
    const result: SendEmailResult = await sendEmailViaGmail(apiKey, message);

    // Print success
    printRelaySuccess(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SMTP] Failed to relay email: ${errorMessage}`);
    throw new Error(`Failed to relay email: ${errorMessage}`);
  }
}

/**
 * Extract recipients from parsed email
 *
 * @param to - Parsed "to" field (can be single object or array)
 * @returns Comma-separated list of recipients
 */
function extractRecipients(
  to: AddressObject | AddressObject[] | undefined
): string {
  if (!to) {
    return '';
  }

  if (Array.isArray(to)) {
    return to.map((addr: AddressObject) => addr.text).join(', ');
  }

  return to.text || '';
}

/**
 * Prints incoming email details to console
 *
 * @param email - The parsed email data
 * @param session - The SMTP session information
 */
function printIncomingEmail(
  email: ParsedEmailData,
  session: AuthenticatedSession
): void {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     INCOMING EMAIL                           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Client:     ${session.remoteAddress}`);
  console.log(`║ Auth User:  ${session.userEmail || 'unknown'}`);
  console.log(`║ From:       ${email.from}`);
  console.log(`║ To:         ${email.to}`);
  console.log(`║ Subject:    ${email.subject}`);
  console.log(`║ Date:       ${email.date?.toISOString() || 'unknown'}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ Body Preview:');
  console.log('╟──────────────────────────────────────────────────────────────');

  // Print first few lines of body
  const bodyLines = email.body.split('\n').slice(0, 5);
  bodyLines.forEach((line) => {
    console.log(`║ ${line.substring(0, 60)}`);
  });

  if (email.body.split('\n').length > 5) {
    console.log('║ ... (truncated)');
  }

  console.log('╚══════════════════════════════════════════════════════════════╝');
}

/**
 * Prints relay success message
 *
 * @param result - The Gmail send result
 */
function printRelaySuccess(result: SendEmailResult): void {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  ✅ EMAIL RELAYED SUCCESSFULLY               ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Gmail Message ID: ${result.messageId}`);
  console.log(`║ Gmail Thread ID:  ${result.threadId}`);
  console.log(`║ Sent From:        ${result.senderEmail}`);
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
      console.log('[SMTP] Authentication required (use registered email + API key)');
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
