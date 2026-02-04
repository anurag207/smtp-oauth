/**
 * Unit Tests for OAuth Routes
 *
 * Tests registration, callback, regeneration, and status endpoints.
 */

import request from 'supertest';
import express from 'express';

// Mock nanoid before importing routes (ESM module)
jest.mock('nanoid', () => ({
  nanoid: jest.fn().mockReturnValue('mockednanoid1234567890123456'),
}));

// Mock dependencies before importing routes
jest.mock('./google-oauth-client', () => ({
  getAuthorizationUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth'),
  exchangeCodeForTokens: jest.fn(),
  getUserEmail: jest.fn(),
  revokeToken: jest.fn(),
  GMAIL_SEND_SCOPE: 'https://www.googleapis.com/auth/gmail.send',
}));

jest.mock('../db/repositories/account-repository', () => ({
  createAccount: jest.fn(),
  getAccountByEmail: jest.fn(),
  updateApiKey: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  oauthLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { authRoutes } from './routes';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserEmail,
  revokeToken,
  GMAIL_SEND_SCOPE,
} from './google-oauth-client';
import {
  createAccount,
  getAccountByEmail,
  updateApiKey,
} from '../db/repositories/account-repository';

describe('OAuth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use('/auth', authRoutes);
  });

  describe('GET /auth/register', () => {
    it('should redirect to Google OAuth URL', async () => {
      const response = await request(app).get('/auth/register');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://accounts.google.com/oauth');
      expect(getAuthorizationUrl).toHaveBeenCalledWith('register');
    });

    it('should return 500 on error', async () => {
      (getAuthorizationUrl as jest.Mock).mockImplementation(() => {
        throw new Error('OAuth error');
      });

      const response = await request(app).get('/auth/register');

      expect(response.status).toBe(500);
      expect(response.text).toContain('Error');
    });
  });

  describe('GET /auth/regenerate', () => {
    it('should redirect to Google OAuth URL with regenerate state', async () => {
      // Ensure the mock returns the correct value
      (getAuthorizationUrl as jest.Mock).mockReturnValue('https://accounts.google.com/oauth');

      const response = await request(app).get('/auth/regenerate');

      expect(response.status).toBe(302);
      expect(getAuthorizationUrl).toHaveBeenCalledWith('regenerate');
    });

    it('should return 500 on error', async () => {
      (getAuthorizationUrl as jest.Mock).mockImplementation(() => {
        throw new Error('OAuth error');
      });

      const response = await request(app).get('/auth/regenerate');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /auth/callback', () => {
    beforeEach(() => {
      // Reset to default mock
      (getAuthorizationUrl as jest.Mock).mockReturnValue('https://accounts.google.com/oauth');
    });

    it('should handle user cancellation', async () => {
      const response = await request(app)
        .get('/auth/callback')
        .query({ error: 'access_denied' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Cancelled');
    });

    it('should handle missing authorization code', async () => {
      const response = await request(app).get('/auth/callback');

      expect(response.status).toBe(400);
      expect(response.text).toContain('No authorization code');
    });

    it('should register new account successfully', async () => {
      (exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiryDate: Date.now() + 3600000,
        scope: GMAIL_SEND_SCOPE,
      });
      (getUserEmail as jest.Mock).mockResolvedValue('newuser@gmail.com');
      (getAccountByEmail as jest.Mock).mockReturnValue(null);
      (createAccount as jest.Mock).mockReturnValue({ email: 'newuser@gmail.com' });

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'auth_code_123', state: 'register' });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Registration Successful');
      expect(response.text).toContain('sk_');
      expect(createAccount).toHaveBeenCalled();
    });

    it('should show already registered for existing account', async () => {
      (exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiryDate: Date.now() + 3600000,
        scope: GMAIL_SEND_SCOPE,
      });
      (getUserEmail as jest.Mock).mockResolvedValue('existing@gmail.com');
      (getAccountByEmail as jest.Mock).mockReturnValue({
        email: 'existing@gmail.com',
        api_key: 'hashed_key',
      });

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'auth_code', state: 'register' });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Already Registered');
      expect(createAccount).not.toHaveBeenCalled();
    });

    it('should regenerate API key for existing account', async () => {
      (exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiryDate: Date.now() + 3600000,
        scope: GMAIL_SEND_SCOPE,
      });
      (getUserEmail as jest.Mock).mockResolvedValue('existing@gmail.com');
      (getAccountByEmail as jest.Mock).mockReturnValue({
        email: 'existing@gmail.com',
        api_key: 'old_hashed_key',
      });

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'auth_code', state: 'regenerate' });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Regenerated');
      expect(response.text).toContain('sk_');
      expect(updateApiKey).toHaveBeenCalled();
    });

    it('should reject regeneration for non-existent account', async () => {
      (exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiryDate: Date.now() + 3600000,
        scope: GMAIL_SEND_SCOPE,
      });
      (getUserEmail as jest.Mock).mockResolvedValue('nonexistent@gmail.com');
      (getAccountByEmail as jest.Mock).mockReturnValue(null);

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'auth_code', state: 'regenerate' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Account Not Found');
    });

    it('should reject missing gmail.send scope', async () => {
      (exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiryDate: Date.now() + 3600000,
        scope: 'only_email_scope',
      });

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'auth_code' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Missing Permission');
      expect(revokeToken).toHaveBeenCalled();
    });

    it('should handle expired code (page refresh) with invalid_grant', async () => {
      (exchangeCodeForTokens as jest.Mock).mockRejectedValue(
        new Error('invalid_grant: Code was already redeemed')
      );

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'reused_code' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Page Expired');
    });

    it('should handle expired code with bad request error', async () => {
      (exchangeCodeForTokens as jest.Mock).mockRejectedValue(new Error('Bad Request'));

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'expired_code' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Page Expired');
    });

    it('should handle generic error', async () => {
      (exchangeCodeForTokens as jest.Mock).mockRejectedValue(
        new Error('Something unexpected happened')
      );

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'some_code' });

      expect(response.status).toBe(500);
      expect(response.text).toContain('Registration Failed');
    });

    it('should include back to home link on success', async () => {
      (exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiryDate: Date.now() + 3600000,
        scope: GMAIL_SEND_SCOPE,
      });
      (getUserEmail as jest.Mock).mockResolvedValue('newuser@gmail.com');
      (getAccountByEmail as jest.Mock).mockReturnValue(null);
      (createAccount as jest.Mock).mockReturnValue({ email: 'newuser@gmail.com' });

      const response = await request(app)
        .get('/auth/callback')
        .query({ code: 'auth_code' });

      expect(response.text).toContain('Back to Home');
    });
  });

  describe('GET /auth/status/:email', () => {
    it('should return registered status for existing account', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue({
        email: 'test@gmail.com',
        created_at: 1700000000,
        access_token: 'token',
      });

      const response = await request(app).get('/auth/status/test@gmail.com');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        registered: true,
        email: 'test@gmail.com',
        createdAt: expect.any(String),
        hasAccessToken: true,
      });
    });

    it('should return not registered for unknown email', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(null);

      const response = await request(app).get('/auth/status/unknown@gmail.com');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        registered: false,
        email: 'unknown@gmail.com',
      });
    });

    it('should indicate when no access token', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue({
        email: 'test@gmail.com',
        created_at: 1700000000,
        access_token: null,
      });

      const response = await request(app).get('/auth/status/test@gmail.com');

      expect(response.body.hasAccessToken).toBe(false);
    });
  });
});

