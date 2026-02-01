/**
 * Test Script - Send Email via SMTP Relay
 *
 * Sends a test email through the local SMTP server to verify it's working.
 *
 * Usage:
 *   npx ts-node scripts/send-test.ts <to> <subject> <body>
 *
 * Example:
 *   npx ts-node scripts/send-test.ts test@example.com "Hello" "This is a test"
 */

import nodemailer from 'nodemailer';

// Configuration
// Use 127.0.0.1 instead of localhost to avoid IPv6 issues on Windows
const SMTP_HOST = process.env.SMTP_HOST || '127.0.0.1';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '2525', 10);
const DEFAULT_FROM = 'test-sender@example.com';

/**
 * Parses command line arguments
 */
function parseArgs(): { to: string; subject: string; body: string } | null {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    return null;
  }

  return {
    to: args[0],
    subject: args[1],
    body: args[2],
  };
}

/**
 * Prints usage instructions
 */
function printUsage(): void {
  console.log('');
  console.log('Usage: npx ts-node scripts/send-test.ts <to> <subject> <body>');
  console.log('');
  console.log('Arguments:');
  console.log('  to       Recipient email address');
  console.log('  subject  Email subject line');
  console.log('  body     Email body text');
  console.log('');
  console.log('Example:');
  console.log('  npx ts-node scripts/send-test.ts test@example.com "Hello" "This is a test"');
  console.log('');
  console.log('Environment variables:');
  console.log('  SMTP_HOST  SMTP server host (default: localhost)');
  console.log('  SMTP_PORT  SMTP server port (default: 2525)');
  console.log('');
}

/**
 * Creates a nodemailer transport configured for the local SMTP server
 */
function createTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // No TLS for local development
    tls: {
      rejectUnauthorized: false, // Accept self-signed certificates
    },
  });
}

/**
 * Sends an email through the SMTP relay
 */
async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const transporter = createTransport();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   Sending Test Email                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ SMTP Server: ${SMTP_HOST}:${SMTP_PORT}`);
  console.log(`║ From:        ${DEFAULT_FROM}`);
  console.log(`║ To:          ${to}`);
  console.log(`║ Subject:     ${subject}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ Body:');
  console.log(`║ ${body}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const result = await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject,
      text: body,
    });

    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Accepted:   ${result.accepted.join(', ')}`);

    if (result.rejected.length > 0) {
      console.log(`   Rejected:   ${result.rejected.join(', ')}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Failed to send email!');
    console.error(`   Error: ${errorMessage}`);
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

  await sendEmail(args.to, args.subject, args.body);
}

// Run the script
main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});

