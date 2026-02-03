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
  GMAIL_SEND_SCOPE,
  revokeToken,
} from './google-client';
import {
  createAccount,
  getAccountByEmail,
} from '../db/repositories/account.repository';
import { oauthLogger } from '../utils/logger';

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
    oauthLogger.info('Starting registration flow');
    const authUrl = getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    oauthLogger.error('Error starting registration', { error });
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
    oauthLogger.warn(`User cancelled or error: ${error}`);
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
    oauthLogger.error('No authorization code received');
    res.status(400).send(`
      <h1>❌ Error</h1>
      <p>No authorization code received from Google.</p>
      <p><a href="/auth/register">Try again</a></p>
    `);
    return;
  }

  try {
    oauthLogger.info('Processing callback');

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Verify that gmail.send scope was granted
    if (!tokens.scope.includes(GMAIL_SEND_SCOPE)) {
      oauthLogger.warn(`Missing required scope. Granted: ${tokens.scope}`);

      // Revoke the token so user can re-authorize with fresh consent screen
      await revokeToken(tokens.accessToken);

      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Missing Permission - SMTP Gmail Relay</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #f59e0b; }
            .warning { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .steps { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
            ol { margin: 10px 0; padding-left: 20px; }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 20px; margin-right: 10px; }
            .btn:hover { background: #2563eb; }
            .btn-secondary { background: #6b7280; }
            .btn-secondary:hover { background: #4b5563; }
          </style>
        </head>
        <body>
          <h1>⚠️ Missing Permission</h1>
          <div class="warning">
            <strong>You didn't grant permission to send emails.</strong>
            <p>The "Send email on your behalf" checkbox must be checked for this relay to work.</p>
          </div>
          <div class="steps">
            <strong>To fix this:</strong>
            <ol>
              <li>Click "Try Again" below</li>
              <li><strong>Make sure to check ALL permission boxes!</strong></li>
            </ol>
            <p><em>Note: We've automatically reset your authorization so you can try again.</em></p>
          </div>
          <a href="/auth/register" class="btn">Try Again</a>
          <a href="/" class="btn btn-secondary">← Back to Home</a>
        </body>
        </html>
      `);
      return;
    }

    // Get user's email
    const email = await getUserEmail(tokens.accessToken);

    // Check if account already exists
    const existingAccount = getAccountByEmail(email);
    if (existingAccount) {
      oauthLogger.info(`Account already exists: ${email}`);
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
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
            .btn:hover { background: #2563eb; }
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
          <a href="/" class="btn">← Back to Home</a>
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

    oauthLogger.info(`Successfully registered: ${email}`);

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
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
          .btn:hover { background: #2563eb; }
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
        <a href="/" class="btn">← Back to Home</a>
      </body>
      </html>
    `);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    oauthLogger.error(`Callback error: ${errorMessage}`);

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - SMTP Gmail Relay</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          h1 { color: #ef4444; }
          .error { background: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 20px; margin-right: 10px; }
          .btn:hover { background: #2563eb; }
          .btn-secondary { background: #6b7280; }
          .btn-secondary:hover { background: #4b5563; }
        </style>
      </head>
      <body>
        <h1>❌ Registration Failed</h1>
        <div class="error">
          <strong>Error:</strong> ${errorMessage}
        </div>
        <a href="/auth/register" class="btn">Try Again</a>
        <a href="/" class="btn btn-secondary">← Back to Home</a>
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
