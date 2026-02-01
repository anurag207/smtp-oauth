/**
 * OAuth Express Server
 *
 * HTTP server for OAuth registration flow.
 * Provides web interface for users to register their Gmail accounts.
 */

import express, { Express } from 'express';
import { config } from '../config';
import { authRoutes } from './routes';

/**
 * Create the OAuth Express application
 *
 * @returns Configured Express application
 */
export function createOAuthServer(): Express {
  const app = express();

  // Parse JSON and URL-encoded bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount authentication routes
  app.use('/auth', authRoutes);

  // Home page with instructions
  app.get('/', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SMTP to Gmail OAuth Relay</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          h1 { color: #3b82f6; }
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
          .btn:hover { background: #2563eb; }
          code { background: #f3f4f6; padding: 2px 8px; border-radius: 4px; }
          .info { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>📧 SMTP to Gmail OAuth Relay</h1>
        <p>This service allows you to send emails through Gmail using standard SMTP protocol.</p>
        
        <div class="info">
          <strong>How it works:</strong>
          <ol>
            <li>Register your Gmail account (one-time setup)</li>
            <li>Get an API key</li>
            <li>Configure your email client/sequencer with SMTP settings</li>
            <li>Send emails through Gmail!</li>
          </ol>
        </div>

        <a href="/auth/register" class="btn">Register Gmail Account</a>

        <h2>SMTP Server Status</h2>
        <p>SMTP Server is running on port <code>${config.smtpPort}</code></p>
      </body>
      </html>
    `);
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'smtp-gmail-oauth-relay',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

/**
 * Start the OAuth HTTP server
 *
 * @param app - Express application
 * @returns Promise that resolves when server is listening
 */
export function startOAuthServer(app: Express): Promise<void> {
  return new Promise((resolve) => {
    app.listen(config.httpPort, () => {
      console.log(`[OAuth] HTTP server listening on http://localhost:${config.httpPort}`);
      console.log(`[OAuth] Register at: http://localhost:${config.httpPort}/auth/register`);
      resolve();
    });
  });
}

