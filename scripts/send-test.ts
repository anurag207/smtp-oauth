/**
 * Test Script - Send Email via SMTP Relay
 *
 * Sends a test email through the local SMTP server to verify it's working.
 * Authenticates with the registered Gmail account using API key.
 *
 * Usage:
 *   npx ts-node scripts/send-test.ts <sender-email> <api-key> <recipient> <subject> <body>
 *
 * Example:
 *   npx ts-node scripts/send-test.ts myemail@gmail.com sk_abc123... recipient@example.com "Hello" "Test message"
 *
 * Environment variables:
 *   SMTP_HOST  - SMTP server host (default: 127.0.0.1)
 *   SMTP_PORT  - SMTP server port (default: 2525)
 */

import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

// Configuration
// Use 127.0.0.1 instead of localhost to avoid IPv6 issues on Windows
const SMTP_HOST = process.env.SMTP_HOST || '127.0.0.1';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '2525', 10);

/**
 * Command line arguments structure
 */
interface SendEmailArgs {
  senderEmail: string;
  apiKey: string;
  recipient: string;
  subject: string;
  body: string;
}

/**
 * Parses command line arguments
 *
 * @returns Parsed arguments or null if invalid
 */
function parseArgs(): SendEmailArgs | null {
  const args = process.argv.slice(2);

  if (args.length < 5) {
    return null;
  }

  return {
    senderEmail: args[0],
    apiKey: args[1],
    recipient: args[2],
    subject: args[3],
    body: args[4],
  };
}

/**
 * Prints usage instructions
 */
function printUsage(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              SMTP to Gmail OAuth Relay - Test Tool           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/send-test.ts <sender> <api-key> <recipient> <subject> <body>');
  console.log('');
  console.log('Arguments:');
  console.log('  sender     Your registered Gmail address');
  console.log('  api-key    API key from OAuth registration (sk_...)');
  console.log('  recipient  Recipient email address');
  console.log('  subject    Email subject line');
  console.log('  body       Email body text');
  console.log('');
  console.log('Example:');
  console.log('  npx ts-node scripts/send-test.ts myemail@gmail.com sk_abc123xyz recipient@example.com "Hello!" "Test message"');
  console.log('');
  console.log('Environment variables:');
  console.log(`  SMTP_HOST  SMTP server host (current: ${SMTP_HOST})`);
  console.log(`  SMTP_PORT  SMTP server port (current: ${SMTP_PORT})`);
  console.log('');
  console.log('To get an API key:');
  console.log('  1. Start the server: npm run dev');
  console.log('  2. Open in browser: http://localhost:3000/auth/register');
  console.log('  3. Authorize with Google and copy your API key');
  console.log('');
}

/**
 * Creates a nodemailer transport configured for the local SMTP server
 *
 * @param email - Sender email for authentication
 * @param apiKey - API key for authentication
 * @returns Configured nodemailer transporter
 */
function createTransport(
  email: string,
  apiKey: string
): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // No TLS for local development
    auth: {
      user: email,
      pass: apiKey,
    },
    tls: {
      rejectUnauthorized: false, // Accept self-signed certificates
    },
  });
}

/**
 * Sends an email through the SMTP relay
 *
 * @param args - Email parameters including auth credentials
 */
async function sendEmail(args: SendEmailArgs): Promise<void> {
  const transporter = createTransport(args.senderEmail, args.apiKey);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   Sending Test Email                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ SMTP Server:  ${SMTP_HOST}:${SMTP_PORT}`);
  console.log(`║ Auth User:    ${args.senderEmail}`);
  console.log(`║ Auth Pass:    ${args.apiKey.substring(0, 10)}...`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ From:         ${args.senderEmail}`);
  console.log(`║ To:           ${args.recipient}`);
  console.log(`║ Subject:      ${args.subject}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ Body:');
  console.log(`║ ${args.body}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const result: SMTPTransport.SentMessageInfo = await transporter.sendMail({
      from: args.senderEmail,
      to: args.recipient,
      subject: args.subject,
      text: args.body,
    });

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║               ✅ EMAIL SENT SUCCESSFULLY!                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ Message ID: ${result.messageId}`);
    console.log(`║ Response:   ${result.response}`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Check the recipient\'s inbox (including spam folder)!');
    console.log('');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║                ❌ FAILED TO SEND EMAIL                       ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error(`║ Error: ${errorMessage}`);
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');

    // Provide helpful troubleshooting tips
    if (errorMessage.includes('Invalid API key')) {
      console.error('Troubleshooting:');
      console.error('  - Make sure you copied the full API key (starts with sk_)');
      console.error('  - Verify the account is registered at http://localhost:3000/auth/register');
      console.error('');
    } else if (errorMessage.includes('Email does not match')) {
      console.error('Troubleshooting:');
      console.error('  - The sender email must match the registered Gmail account');
      console.error('  - Check your registered email at http://localhost:3000');
      console.error('');
    } else if (errorMessage.includes('ECONNREFUSED')) {
      console.error('Troubleshooting:');
      console.error('  - Make sure the SMTP server is running: npm run dev');
      console.error(`  - Server should be listening on ${SMTP_HOST}:${SMTP_PORT}`);
      console.error('');
    }

    process.exit(1);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (!args) {
    console.error('❌ Error: Missing required arguments');
    printUsage();
    process.exit(1);
  }

  // Basic validation
  if (!args.senderEmail.includes('@')) {
    console.error('❌ Error: Invalid sender email address');
    printUsage();
    process.exit(1);
  }

  if (!args.apiKey.startsWith('sk_')) {
    console.error('❌ Error: Invalid API key (should start with sk_)');
    printUsage();
    process.exit(1);
  }

  if (!args.recipient.includes('@')) {
    console.error('❌ Error: Invalid recipient email address');
    printUsage();
    process.exit(1);
  }

  await sendEmail(args);
}

// Run the script
main().catch((err: Error) => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
