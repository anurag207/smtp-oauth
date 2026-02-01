/**
 * Gmail API Client
 *
 * Sends emails through Gmail's REST API using OAuth access tokens.
 * Handles automatic token refresh when access tokens expire.
 */

import { refreshAccessToken, RefreshedTokenResponse } from '../oauth/google-client';
import {
  Account,
  getAccountByApiKey,
  updateTokens,
} from '../db/repositories/account.repository';

/**
 * Email message structure for sending via Gmail API
 */
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Gmail API send response structure
 */
export interface GmailSendResponse {
  id: string;
  threadId: string;
  labelIds: string[];
}

/**
 * Result returned after successfully sending an email
 */
export interface SendEmailResult {
  messageId: string;
  threadId: string;
  senderEmail: string;
}

/**
 * Token validation result
 */
interface ValidAccessToken {
  accessToken: string;
  email: string;
}

/**
 * Check if an access token is expired
 *
 * Uses a 5-minute buffer to ensure we refresh before actual expiry,
 * preventing failed API calls due to race conditions.
 *
 * @param expiryTimestamp - Token expiry timestamp in Unix seconds (or null if unknown)
 * @returns true if token is expired or will expire within 5 minutes
 */
function isTokenExpired(expiryTimestamp: number | null): boolean {
  if (expiryTimestamp === null) {
    return true; // No expiry means we should refresh
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const bufferSeconds = 5 * 60; // 5 minutes buffer

  return nowInSeconds >= expiryTimestamp - bufferSeconds;
}

/**
 * Get a valid access token for an account
 *
 * Checks the database for a cached access token. If the token is expired
 * or missing, automatically refreshes it using the stored refresh token.
 *
 * @param apiKey - The API key used for SMTP authentication
 * @returns Valid access token and associated email
 * @throws Error if API key is invalid or token refresh fails
 */
async function getValidAccessToken(apiKey: string): Promise<ValidAccessToken> {
  const account: Account | null = getAccountByApiKey(apiKey);

  if (!account) {
    throw new Error('Invalid API key - account not found');
  }

  // Check if we have a valid (non-expired) access token
  if (account.access_token && !isTokenExpired(account.token_expiry)) {
    console.log(`[Gmail] Using cached access token for ${account.email}`);
    return {
      accessToken: account.access_token,
      email: account.email,
    };
  }

  // Token is expired or missing - refresh it
  console.log(`[Gmail] Refreshing access token for ${account.email}`);

  const refreshed: RefreshedTokenResponse = await refreshAccessToken(
    account.refresh_token
  );

  // Convert milliseconds to seconds for database storage
  const expiryInSeconds = Math.floor(refreshed.expiryDate / 1000);

  // Save the new token to database for future use
  updateTokens(account.email, refreshed.accessToken, expiryInSeconds);

  return {
    accessToken: refreshed.accessToken,
    email: account.email,
  };
}

/**
 * Build an RFC 2822 formatted email message
 *
 * Gmail API requires emails in RFC 2822 format. This function constructs
 * the raw email with proper headers.
 *
 * @param message - The email message to format
 * @returns Raw email string in RFC 2822 format
 */
function buildRawEmail(message: EmailMessage): string {
  const headers: string[] = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ];

  const body = message.text;

  // RFC 2822 format: headers separated by CRLF, blank line, then body
  return headers.join('\r\n') + '\r\n\r\n' + body;
}

/**
 * Encode a string to base64url format
 *
 * Gmail API requires the raw email to be encoded in base64url format
 * (not standard base64). This replaces URL-unsafe characters.
 *
 * @param str - String to encode
 * @returns base64url encoded string
 */
function encodeBase64Url(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-') // Replace + with -
    .replace(/\//g, '_') // Replace / with _
    .replace(/=+$/, ''); // Remove trailing padding
}

/**
 * Send an email via Gmail API
 *
 * This is the main function that handles the complete email sending flow:
 * 1. Validates the API key and gets account info
 * 2. Gets or refreshes the access token
 * 3. Builds and encodes the email message
 * 4. Sends via Gmail API
 *
 * @param apiKey - API key for SMTP authentication (from registered account)
 * @param message - Email message to send
 * @returns Send result with message ID and thread ID
 * @throws Error if authentication fails or Gmail API returns an error
 */
export async function sendEmailViaGmail(
  apiKey: string,
  message: EmailMessage
): Promise<SendEmailResult> {
  // Step 1: Get valid access token (refreshes if needed)
  const { accessToken, email } = await getValidAccessToken(apiKey);

  // Step 2: Ensure "from" matches the authenticated account
  // Gmail API will reject emails from addresses not owned by the user
  const normalizedFrom = message.from.toLowerCase();
  const normalizedEmail = email.toLowerCase();

  if (!normalizedFrom.includes(normalizedEmail)) {
    console.warn(
      `[Gmail] Warning: Overriding sender from "${message.from}" to "${email}"`
    );
    message.from = email;
  }

  // Step 3: Build and encode the email
  const rawEmail = buildRawEmail(message);
  const encodedEmail = encodeBase64Url(rawEmail);

  console.log(`[Gmail] Sending email from ${email} to ${message.to}`);
  console.log(`[Gmail] Subject: ${message.subject}`);

  // Step 4: Send via Gmail API
  const apiUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedEmail }),
  });

  // Handle API errors
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gmail] API Error: ${response.status} - ${errorText}`);

    // Provide helpful error messages for common issues
    if (response.status === 401) {
      throw new Error('Gmail API authentication failed. Token may be revoked.');
    }
    if (response.status === 403) {
      throw new Error('Gmail API permission denied. Check OAuth scopes.');
    }
    if (response.status === 429) {
      throw new Error('Gmail API rate limit exceeded. Try again later.');
    }

    throw new Error(`Gmail API error: ${response.status} - ${response.statusText}`);
  }

  // Parse successful response
  const result = (await response.json()) as GmailSendResponse;

  console.log(`[Gmail] ✅ Email sent successfully!`);
  console.log(`[Gmail]    Message ID: ${result.id}`);
  console.log(`[Gmail]    Thread ID: ${result.threadId}`);

  return {
    messageId: result.id,
    threadId: result.threadId,
    senderEmail: email,
  };
}

