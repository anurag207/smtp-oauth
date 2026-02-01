/**
 * OAuth Routes
 *
 * Express routes for OAuth registration flow.
 * - /auth/register: Start OAuth flow, redirect to Google
 * - /auth/callback: Handle Google callback, save tokens, show API key
 */

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserEmail,
} from './google-client';
import {
  createAccount,
  getAccountByEmail,
} from '../db/repositories/account.repository';

/**
 * OAuth router instance
 */
export const authRoutes = Router();

/**
 * GET /auth/register
 *
 * Starts the OAuth flow by redirecting the user to Google's consent screen.
 */
authRoutes.get('/register', (_req: Request, res: Response): void => {
  try {
    console.log('[OAuth] Starting registration flow');
    const authUrl = getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('[OAuth] Error starting registration:', error);
    res.status(500).send(`
      <h1>❌ Error</h1>
      <p>Failed to start OAuth flow. Please check server logs.</p>
      <p><a href="/auth/register">Try again</a></p>
    `);
  }
});

/**
 * GET /auth/callback
 *
 * Handles the OAuth callback from Google.
 * Exchanges the authorization code for tokens and saves to database.
 */
authRoutes.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  // Handle user cancellation or errors
  if (error) {
    console.log(`[OAuth] User cancelled or error: ${error}`);
    res.status(400).send(`
      <h1>❌ Authorization Cancelled</h1>
      <p>You cancelled the authorization or an error occurred.</p>
      <p>Error: ${error}</p>
      <p><a href="/auth/register">Try again</a></p>
    `);
    return;
  }

  // Validate authorization code
  if (!code) {
    console.error('[OAuth] No authorization code received');
    res.status(400).send(`
      <h1>❌ Error</h1>
      <p>No authorization code received from Google.</p>
      <p><a href="/auth/register">Try again</a></p>
    `);
    return;
  }

  try {
    console.log('[OAuth] Processing callback');

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user's email
    const email = await getUserEmail(tokens.accessToken);

    // Check if account already exists
    const existingAccount = getAccountByEmail(email);
    if (existingAccount) {
      console.log(`[OAuth] Account already exists: ${email}`);
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already Registered - SMTP Gmail Relay</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #f59e0b; }
            code { background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 14px; }
            .api-key { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all; }
            pre { background: #1f2937; color: #e5e7eb; padding: 15px; border-radius: 8px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>⚠️ Already Registered</h1>
          <p>This Gmail account is already registered.</p>
          <p><strong>Email:</strong> ${email}</p>
          <div class="api-key">
            <strong>Your existing API Key:</strong><br>
            <code>${existingAccount.api_key}</code>
          </div>
          <h2>SMTP Configuration</h2>
          <pre>
Host:     localhost (or your server IP)
Port:     2525
Username: ${email}
Password: ${existingAccount.api_key}
          </pre>
        </body>
        </html>
      `);
      return;
    }

    // Generate a new API key
    const apiKey = 'sk_' + nanoid(32);

    // Save account to database
    createAccount({
      email,
      refreshToken: tokens.refreshToken,
      apiKey,
    });

    console.log(`[OAuth] Successfully registered: ${email}`);

    // Show success page with API key
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Registration Successful - SMTP Gmail Relay</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          h1 { color: #10b981; }
          code { background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 14px; }
          .api-key { background: #d1fae5; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all; }
          .warning { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; }
          pre { background: #1f2937; color: #e5e7eb; padding: 15px; border-radius: 8px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>✅ Registration Successful!</h1>
        <p>Your Gmail account has been connected to the SMTP relay.</p>
        <p><strong>Email:</strong> ${email}</p>
        <div class="api-key">
          <strong>Your API Key:</strong><br>
          <code>${apiKey}</code>
        </div>
        <div class="warning">
          <strong>⚠️ Important:</strong> Save this API key now! It won't be shown again.
        </div>
        <h2>SMTP Configuration</h2>
        <p>Configure your email client or sequencer with these settings:</p>
        <pre>
Host:     localhost (or your server IP)
Port:     2525
Username: ${email}
Password: ${apiKey}
        </pre>
        <h2>Test with Command Line</h2>
        <pre>
npx ts-node scripts/send-test.ts recipient@example.com "Test Subject" "Test Body"
        </pre>
      </body>
      </html>
    `);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[OAuth] Callback error:', errorMessage);

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - SMTP Gmail Relay</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          h1 { color: #ef4444; }
          .error { background: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>❌ Registration Failed</h1>
        <div class="error">
          <strong>Error:</strong> ${errorMessage}
        </div>
        <p><a href="/auth/register">Try again</a></p>
      </body>
      </html>
    `);
  }
});

/**
 * GET /auth/status/:email
 *
 * Check if an email is registered (for debugging/admin)
 */
authRoutes.get('/status/:email', (req: Request, res: Response): void => {
  const email = req.params.email as string;
  const account = getAccountByEmail(email);

  if (account) {
    res.json({
      registered: true,
      email: account.email,
      createdAt: new Date(account.created_at * 1000).toISOString(),
      hasAccessToken: !!account.access_token,
    });
  } else {
    res.json({
      registered: false,
      email,
    });
  }
});
