/**
 * Load Test Script - SMTP Relay
 *
 * Tests the relay under various load conditions:
 * - Sequential sends
 * - Concurrent sends
 * - Measures success rate and timing
 *
 * Usage:
 *   npx ts-node scripts/load-test.ts <sender> <api-key> <recipient> <mode> <count>
 *
 * Modes:
 *   sequential  - Send emails one after another
 *   concurrent  - Send all emails at the same time
 *
 * Example:
 *   npx ts-node scripts/load-test.ts sender@gmail.com sk_xxx recipient@gmail.com sequential 5
 */

import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

// Configuration
const SMTP_HOST = process.env.SMTP_HOST || '127.0.0.1';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '2525', 10);

interface TestResult {
  index: number;
  success: boolean;
  duration: number;
  error?: string;
}

interface TestArgs {
  senderEmail: string;
  apiKey: string;
  recipient: string;
  mode: 'sequential' | 'concurrent';
  count: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): TestArgs | null {
  const args = process.argv.slice(2);

  if (args.length < 5) {
    return null;
  }

  const mode = args[3] as 'sequential' | 'concurrent';
  if (mode !== 'sequential' && mode !== 'concurrent') {
    return null;
  }

  return {
    senderEmail: args[0],
    apiKey: args[1],
    recipient: args[2],
    mode,
    count: parseInt(args[4], 10),
  };
}

/**
 * Print usage instructions
 */
function printUsage(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║               SMTP Relay Load Test Tool                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/load-test.ts <sender> <api-key> <recipient> <mode> <count>');
  console.log('');
  console.log('Arguments:');
  console.log('  sender     Your registered Gmail address');
  console.log('  api-key    API key (sk_...)');
  console.log('  recipient  Recipient email address');
  console.log('  mode       "sequential" or "concurrent"');
  console.log('  count      Number of emails to send');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/load-test.ts me@gmail.com sk_xxx test@gmail.com sequential 5');
  console.log('  npx ts-node scripts/load-test.ts me@gmail.com sk_xxx test@gmail.com concurrent 10');
  console.log('');
}

/**
 * Create nodemailer transporter
 */
function createTransport(
  email: string,
  apiKey: string
): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: email,
      pass: apiKey,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Send a single test email and measure timing
 */
async function sendSingleEmail(
  transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>,
  from: string,
  to: string,
  index: number
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    await transporter.sendMail({
      from,
      to,
      subject: `Load Test Email #${index + 1} - ${new Date().toISOString()}`,
      text: `This is load test email number ${index + 1}.\n\nSent at: ${new Date().toISOString()}`,
    });

    const duration = Date.now() - startTime;
    return { index, success: true, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { index, success: false, duration, error: errorMessage };
  }
}

/**
 * Run sequential load test
 */
async function runSequentialTest(
  transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>,
  from: string,
  to: string,
  count: number
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (let i = 0; i < count; i++) {
    console.log(`  Sending email ${i + 1}/${count}...`);
    const result = await sendSingleEmail(transporter, from, to, i);
    results.push(result);

    if (result.success) {
      console.log(`    ✅ Success (${result.duration}ms)`);
    } else {
      console.log(`    ❌ Failed: ${result.error}`);
    }
  }

  return results;
}

/**
 * Run concurrent load test
 */
async function runConcurrentTest(
  transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>,
  from: string,
  to: string,
  count: number
): Promise<TestResult[]> {
  console.log(`  Sending ${count} emails concurrently...`);

  const promises = Array.from({ length: count }, (_, i) =>
    sendSingleEmail(transporter, from, to, i)
  );

  const results = await Promise.all(promises);

  // Print individual results
  results.forEach((result) => {
    if (result.success) {
      console.log(`    Email #${result.index + 1}: ✅ Success (${result.duration}ms)`);
    } else {
      console.log(`    Email #${result.index + 1}: ❌ Failed: ${result.error}`);
    }
  });

  return results;
}

/**
 * Print test summary
 */
function printSummary(results: TestResult[], totalTime: number): void {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const durations = successful.map((r) => r.duration);
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    LOAD TEST RESULTS                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Total Emails:     ${results.length.toString().padEnd(42)}║`);
  console.log(`║ Successful:       ${successful.length.toString().padEnd(42)}║`);
  console.log(`║ Failed:           ${failed.length.toString().padEnd(42)}║`);
  console.log(`║ Success Rate:     ${((successful.length / results.length) * 100).toFixed(1)}%${' '.repeat(39)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Total Time:       ${totalTime}ms${' '.repeat(38 - totalTime.toString().length)}║`);
  console.log(`║ Avg per Email:    ${avgDuration}ms${' '.repeat(38 - avgDuration.toString().length)}║`);
  console.log(`║ Min Duration:     ${minDuration}ms${' '.repeat(38 - minDuration.toString().length)}║`);
  console.log(`║ Max Duration:     ${maxDuration}ms${' '.repeat(38 - maxDuration.toString().length)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (failed.length > 0) {
    console.log('');
    console.log('Failed emails:');
    failed.forEach((r) => {
      console.log(`  #${r.index + 1}: ${r.error}`);
    });
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (!args) {
    console.error('❌ Error: Invalid arguments');
    printUsage();
    process.exit(1);
  }

  // Validate
  if (!args.senderEmail.includes('@')) {
    console.error('❌ Error: Invalid sender email');
    process.exit(1);
  }

  if (!args.apiKey.startsWith('sk_')) {
    console.error('❌ Error: Invalid API key format');
    process.exit(1);
  }

  if (!args.recipient.includes('@')) {
    console.error('❌ Error: Invalid recipient email');
    process.exit(1);
  }

  if (args.count < 1 || args.count > 100) {
    console.error('❌ Error: Count must be between 1 and 100');
    process.exit(1);
  }

  // Create transporter
  const transporter = createTransport(args.senderEmail, args.apiKey);

  // Print header
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  STARTING LOAD TEST                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Mode:       ${args.mode.padEnd(49)}║`);
  console.log(`║ Count:      ${args.count.toString().padEnd(49)}║`);
  console.log(`║ From:       ${args.senderEmail.substring(0, 49).padEnd(49)}║`);
  console.log(`║ To:         ${args.recipient.substring(0, 49).padEnd(49)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Run test
  const startTime = Date.now();
  let results: TestResult[];

  if (args.mode === 'sequential') {
    console.log('Running sequential test...');
    results = await runSequentialTest(transporter, args.senderEmail, args.recipient, args.count);
  } else {
    console.log('Running concurrent test...');
    results = await runConcurrentTest(transporter, args.senderEmail, args.recipient, args.count);
  }

  const totalTime = Date.now() - startTime;

  // Print summary
  printSummary(results, totalTime);
}

// Run
main().catch((err: Error) => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});

