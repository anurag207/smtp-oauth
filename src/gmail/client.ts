/**
 * Gmail API Client
 *
 * Sends emails through Gmail's REST API using OAuth access tokens.
 * Handles automatic token refresh when access tokens expire.
 */

import { refreshAccessToken, RefreshedTokenResponse } from '../oauth/google-client';
import {
  Account,
  getAccountByEmail,
  updateTokens,
  getDecryptedAccessToken,
  getDecryptedRefreshToken,
} from '../db/repositories/account.repository';
import { gmailLogger } from '../utils/logger';
import { GMAIL_SEND_API_URL } from '../constants/google-api';

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
 * Security: Decrypts tokens from database storage before use.
 *
 * @param userEmail - The email address of the authenticated user
 * @returns Valid access token and associated email
 * @throws Error if account not found or token refresh fails
 */
async function getValidAccessToken(userEmail: string): Promise<ValidAccessToken> {
  const account: Account | null = getAccountByEmail(userEmail);

  if (!account) {
    throw new Error('Account not found');
  }

  // Check if we have a valid (non-expired) access token
  if (account.access_token && !isTokenExpired(account.token_expiry)) {
    // Decrypt the access token before returning
    const decryptedAccessToken = getDecryptedAccessToken(account);
    if (decryptedAccessToken) {
      gmailLogger.debug(`Using cached access token for ${account.email}`);
      return {
        accessToken: decryptedAccessToken,
        email: account.email,
      };
    }
  }

  // Token is expired or missing - refresh it
  gmailLogger.info(`Refreshing access token for ${account.email}`);

  // Decrypt refresh token before using with Google API
  const decryptedRefreshToken = getDecryptedRefreshToken(account);

  const refreshed: RefreshedTokenResponse = await refreshAccessToken(
    decryptedRefreshToken
  );

  // Convert milliseconds to seconds for database storage
  const expiryInSeconds = Math.floor(refreshed.expiryDate / 1000);

  // Save the new token to database (repository will encrypt it)
  updateTokens(account.email, refreshed.accessToken, expiryInSeconds);

  return {
    accessToken: refreshed.accessToken,
    email: account.email,
  };
}

/**
 * Encode a string for use in email headers (RFC 2047)
 *
 * Non-ASCII characters (like emojis, Chinese, etc.) in email headers
 * must be encoded using MIME encoded-word syntax.
 *
 * @param text - Text to encode
 * @returns Encoded string safe for email headers
 */
function encodeHeaderValue(text: string): string {
  // Check if text contains non-ASCII characters
  const hasNonAscii = /[^\x00-\x7F]/.test(text);

  if (!hasNonAscii) {
    return text; // Plain ASCII, no encoding needed
  }

  // Encode using MIME encoded-word syntax (RFC 2047)
  // Format: =?charset?encoding?encoded_text?=
  const encoded = Buffer.from(text, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

/**
 * Build an RFC 2822 formatted email message
 *
 * Gmail API requires emails in RFC 2822 format. This function constructs
 * the raw email with proper headers and encoding for Unicode support.
 *
 * @param message - The email message to format
 * @returns Raw email string in RFC 2822 format
 */
function buildRawEmail(message: EmailMessage): string {
  const headers: string[] = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];

  // Encode body in base64 for proper UTF-8 handling
  const encodedBody = Buffer.from(message.text, 'utf-8').toString('base64');

  // RFC 2822 format: headers separated by CRLF, blank line, then body
  return headers.join('\r\n') + '\r\n\r\n' + encodedBody;
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
 * 1. Gets or refreshes the access token for the authenticated user
 * 2. Builds and encodes the email message
 * 3. Sends via Gmail API
 *
 * @param userEmail - Email address of the authenticated user (from SMTP auth)
 * @param message - Email message to send
 * @returns Send result with message ID and thread ID
 * @throws Error if authentication fails or Gmail API returns an error
 */
export async function sendEmailViaGmail(
  userEmail: string,
  message: EmailMessage
): Promise<SendEmailResult> {
  // Step 1: Get valid access token (refreshes if needed)
  const { accessToken, email } = await getValidAccessToken(userEmail);

  // Step 2: Ensure "from" matches the authenticated account
  // Gmail API will reject emails from addresses not owned by the user
  const normalizedFrom = message.from.toLowerCase();
  const normalizedEmail = email.toLowerCase();

  if (!normalizedFrom.includes(normalizedEmail)) {
    gmailLogger.warn(`Overriding sender from "${message.from}" to "${email}"`);
    message.from = email;
  }

  // Step 3: Build and encode the email
  const rawEmail = buildRawEmail(message);
  const encodedEmail = encodeBase64Url(rawEmail);

  gmailLogger.info(`Sending email from ${email} to ${message.to}`);
  gmailLogger.debug(`Subject: ${message.subject}`);

  // Step 4: Send via Gmail API
  const response = await fetch(GMAIL_SEND_API_URL, {
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
    gmailLogger.error(`API Error: ${response.status} - ${errorText}`);

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

  gmailLogger.info('Email sent successfully!', {
    messageId: result.id,
    threadId: result.threadId,
    to: message.to,
  });

  return {
    messageId: result.id,
    threadId: result.threadId,
    senderEmail: email,
  };
}

