/**
 * Database Test Script
 *
 * Tests the database layer functionality.
 * Run with: npx ts-node scripts/test-db.ts
 */

import { initializeDatabase, closeDatabase } from '../src/db';
import { createTables } from '../src/db/schema';
import {
  createAccount,
  getAccountByEmail,
  getAccountByApiKey,
  updateTokens,
  deleteAccount,
  getAllAccounts,
  countAccounts,
} from '../src/db/repositories/account.repository';

// Test database path (separate from production)
const TEST_DB_PATH = './data/test-relay.db';

function generateApiKey(): string {
  return 'sk_test_' + Math.random().toString(36).substring(2, 15);
}

async function runTests(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Database Layer Tests                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  console.log('1. Initializing database...');
  initializeDatabase(TEST_DB_PATH);
  createTables();
  console.log('   ✅ Database initialized\n');

  // Test data
  const testEmail = 'test@example.com';
  const testRefreshToken = 'test_refresh_token_123';
  const testApiKey = generateApiKey();

  // Test: Create account
  console.log('2. Testing createAccount()...');
  try {
    const account = createAccount({
      email: testEmail,
      refreshToken: testRefreshToken,
      apiKey: testApiKey,
    });
    console.log(`   ✅ Created account: ${account.email}`);
    console.log(`   ✅ API Key: ${account.api_key}`);
    console.log(`   ✅ ID: ${account.id}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error}\n`);
  }

  // Test: Get account by email
  console.log('3. Testing getAccountByEmail()...');
  const byEmail = getAccountByEmail(testEmail);
  if (byEmail) {
    console.log(`   ✅ Found account by email: ${byEmail.email}\n`);
  } else {
    console.log('   ❌ Account not found by email\n');
  }

  // Test: Get account by API key
  console.log('4. Testing getAccountByApiKey()...');
  const byApiKey = getAccountByApiKey(testApiKey);
  if (byApiKey) {
    console.log(`   ✅ Found account by API key: ${byApiKey.email}\n`);
  } else {
    console.log('   ❌ Account not found by API key\n');
  }

  // Test: Update tokens
  console.log('5. Testing updateTokens()...');
  const newAccessToken = 'new_access_token_xyz';
  const newExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  try {
    updateTokens(testEmail, newAccessToken, newExpiry);
    const updated = getAccountByEmail(testEmail);
    if (updated?.access_token === newAccessToken) {
      console.log(`   ✅ Tokens updated successfully`);
      console.log(`   ✅ New access_token: ${updated.access_token}`);
      console.log(`   ✅ Expiry: ${new Date(newExpiry * 1000).toISOString()}\n`);
    } else {
      console.log('   ❌ Token update verification failed\n');
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error}\n`);
  }

  // Test: Count accounts
  console.log('6. Testing countAccounts()...');
  const count = countAccounts();
  console.log(`   ✅ Total accounts: ${count}\n`);

  // Test: Get all accounts
  console.log('7. Testing getAllAccounts()...');
  const allAccounts = getAllAccounts();
  console.log(`   ✅ Retrieved ${allAccounts.length} account(s)\n`);

  // Test: Delete account
  console.log('8. Testing deleteAccount()...');
  const deleted = deleteAccount(testEmail);
  if (deleted) {
    console.log(`   ✅ Account deleted successfully`);
    const afterDelete = getAccountByEmail(testEmail);
    if (!afterDelete) {
      console.log('   ✅ Verified: Account no longer exists\n');
    } else {
      console.log('   ❌ Account still exists after delete\n');
    }
  } else {
    console.log('   ❌ Delete returned false\n');
  }

  // Test: Get non-existent account
  console.log('9. Testing getAccountByEmail() for non-existent account...');
  const notFound = getAccountByEmail('nonexistent@example.com');
  if (notFound === null) {
    console.log('   ✅ Correctly returned null for non-existent account\n');
  } else {
    console.log('   ❌ Should have returned null\n');
  }

  // Cleanup
  console.log('10. Cleaning up...');
  closeDatabase();
  console.log('   ✅ Database connection closed\n');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              All Tests Completed!                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// Run tests
runTests().catch((err) => {
  console.error('Test failed:', err);
  closeDatabase();
  process.exit(1);
});

