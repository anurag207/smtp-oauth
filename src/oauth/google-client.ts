/**
 * Google OAuth Client
 *
 * Handles OAuth 2.0 authentication with Google for Gmail API access.
 * Provides functions to generate auth URLs, exchange codes, and refresh tokens.
 */

import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { oauthLogger } from '../utils/logger';

/**
 * OAuth2 client instance configured with Google credentials
 */
const oauth2Client = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRedirectUri
);

/**
 * Required scope for sending emails via Gmail API
 */
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/**
 * OAuth scopes required:
 * - gmail.send: Send emails via Gmail API
 * - userinfo.email: Get user's email address during registration
 */
const SCOPES = [
  GMAIL_SEND_SCOPE,
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Token response structure
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope: string;
}

/**
 * Refreshed token response structure
 */
export interface RefreshedTokenResponse {
  accessToken: string;
  expiryDate: number;
}

/**
 * Generate the OAuth authorization URL
 *
 * This URL redirects users to Google's consent screen where they
 * can authorize the app to send emails on their behalf.
 *
 * @returns Authorization URL to redirect users to
 */
export function getAuthorizationUrl(): string {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Request refresh_token for long-term access
    scope: SCOPES,
    prompt: 'consent', // Always show consent screen to get refresh_token
  });

  oauthLogger.debug('Generated authorization URL');
  return url;
}

/**
 * Exchange authorization code for OAuth tokens
 *
 * After the user authorizes the app, Google redirects back with an
 * authorization code. This function exchanges that code for access
 * and refresh tokens.
 *
 * @param code - Authorization code from Google callback
 * @returns Token response with access_token, refresh_token, and expiry
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<TokenResponse> {
  oauthLogger.debug('Exchanging authorization code for tokens');

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('No access token received from Google');
  }

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token received. User may have already authorized this app. ' +
        'Revoke access at https://myaccount.google.com/permissions and try again.'
    );
  }

  oauthLogger.info('Successfully obtained tokens');
  oauthLogger.debug(`Granted scopes: ${tokens.scope}`);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
    scope: tokens.scope || '',
  };
}

/**
 * Refresh an expired access token using the refresh token
 *
 * Access tokens expire after 1 hour. This function uses the long-lived
 * refresh token to obtain a new access token without user interaction.
 *
 * @param refreshToken - The refresh token stored in the database
 * @returns New access token and expiry date
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshedTokenResponse> {
  oauthLogger.debug('Refreshing access token');

  // Create a new client instance for this operation
  const client = new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );

  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  oauthLogger.info('Successfully refreshed access token');

  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date || Date.now() + 3600 * 1000,
  };
}

/**
 * Get user's email address from Google using the access token
 *
 * @param accessToken - Valid access token
 * @returns User's Gmail address
 */
export async function getUserEmail(accessToken: string): Promise<string> {
  oauthLogger.debug('Fetching user email from Google');

  // Create a client with the access token
  const client = new OAuth2Client();
  client.setCredentials({ access_token: accessToken });

  // Get user info
  const response = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }

  const userInfo = (await response.json()) as { email: string };

  if (!userInfo.email) {
    throw new Error('No email found in user info');
  }

  oauthLogger.info(`User email: ${userInfo.email}`);
  return userInfo.email;
}

/**
 * Revoke an OAuth token
 *
 * This makes Google forget the previous authorization, allowing the user
 * to re-authorize with a fresh consent screen. Useful when the user
 * didn't grant all required permissions.
 *
 * @param accessToken - The access token to revoke
 */
export async function revokeToken(accessToken: string): Promise<void> {
  oauthLogger.info('Revoking token due to insufficient scopes');

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${accessToken}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      oauthLogger.warn('Token revoke request failed (may already be revoked)');
    } else {
      oauthLogger.info('Token successfully revoked');
    }
  } catch (error) {
    oauthLogger.warn('Token revoke error', { error });
    // Don't throw - revocation failure shouldn't block the user flow
  }
}

