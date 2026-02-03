/**
 * Google API Constants
 *
 * Centralized collection of Google API URLs and OAuth scopes.
 * These are stable, official Google endpoints that rarely change.
 */

// ============================================================================
// OAuth Scopes
// ============================================================================

/**
 * Required scope for sending emails via Gmail API
 */
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/**
 * Scope for retrieving user's email address during registration
 */
export const USERINFO_EMAIL_SCOPE =
  'https://www.googleapis.com/auth/userinfo.email';

/**
 * All OAuth scopes required by the relay application
 */
export const REQUIRED_SCOPES = [GMAIL_SEND_SCOPE, USERINFO_EMAIL_SCOPE];

// ============================================================================
// Google API Endpoints
// ============================================================================

/**
 * Google OAuth2 user info endpoint
 * Used to retrieve the authenticated user's email address
 */
export const GOOGLE_USERINFO_URL =
  'https://www.googleapis.com/oauth2/v2/userinfo';

/**
 * Google OAuth2 token revocation endpoint
 * Used to revoke tokens when user needs to re-authorize
 */
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * Gmail API send endpoint
 * Used to send emails through Gmail
 */
export const GMAIL_SEND_API_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// ============================================================================
// User-Facing URLs (for error messages)
// ============================================================================

/**
 * Google account permissions page
 * Users can manually revoke app access here
 */
export const GOOGLE_PERMISSIONS_URL = 'https://myaccount.google.com/permissions';

