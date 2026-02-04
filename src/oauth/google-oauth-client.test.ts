/**
 * Unit Tests for Google OAuth Client
 *
 * Tests OAuth URL generation, token exchange, refresh, and revocation.
 * Mocks Google's OAuth2Client and fetch.
 */

// Mock google-auth-library
const mockGenerateAuthUrl = jest.fn();
const mockGetToken = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockSetCredentials = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    refreshAccessToken: mockRefreshAccessToken,
    setCredentials: mockSetCredentials,
  })),
}));

// Mock config
jest.mock('../config', () => ({
  config: {
    googleClientId: 'test-client-id',
    googleClientSecret: 'test-client-secret',
    googleRedirectUri: 'http://localhost:3000/auth/callback',
  },
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  oauthLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getUserEmail,
  revokeToken,
} from './google-oauth-client';

describe('Google OAuth Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthorizationUrl()', () => {
    it('should generate authorization URL for registration', () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/oauth?state=register');

      const url = getAuthorizationUrl('register');

      expect(url).toContain('accounts.google.com');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          prompt: 'consent',
          state: 'register',
        })
      );
    });

    it('should generate authorization URL for regeneration', () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/oauth?state=regenerate');

      const url = getAuthorizationUrl('regenerate');

      expect(url).toContain('accounts.google.com');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'regenerate',
        })
      );
    });

    it('should default to register action', () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/oauth');

      getAuthorizationUrl();

      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'register',
        })
      );
    });

    it('should include required scopes', () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/oauth');

      getAuthorizationUrl('register');

      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.arrayContaining([
            expect.stringContaining('gmail.send'),
          ]),
        })
      );
    });
  });

  describe('exchangeCodeForTokens()', () => {
    it('should exchange code for tokens successfully', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'access_token_123',
          refresh_token: 'refresh_token_456',
          expiry_date: Date.now() + 3600000,
          scope: 'https://www.googleapis.com/auth/gmail.send',
        },
      });

      const result = await exchangeCodeForTokens('auth_code_123');

      expect(result.accessToken).toBe('access_token_123');
      expect(result.refreshToken).toBe('refresh_token_456');
      expect(result.scope).toContain('gmail.send');
    });

    it('should throw error when no access token received', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          refresh_token: 'refresh_token',
        },
      });

      await expect(exchangeCodeForTokens('code')).rejects.toThrow(
        'No access token received'
      );
    });

    it('should throw error when no refresh token received', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'access_token',
        },
      });

      await expect(exchangeCodeForTokens('code')).rejects.toThrow(
        'No refresh token received'
      );
    });

    it('should use default expiry if not provided', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'access_token',
          refresh_token: 'refresh_token',
          scope: 'scope',
        },
      });

      const result = await exchangeCodeForTokens('code');

      expect(result.expiryDate).toBeGreaterThan(Date.now());
    });

    it('should handle empty scope', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'access_token',
          refresh_token: 'refresh_token',
          expiry_date: Date.now() + 3600000,
        },
      });

      const result = await exchangeCodeForTokens('code');

      expect(result.scope).toBe('');
    });
  });

  describe('refreshAccessToken()', () => {
    it('should refresh access token successfully', async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new_access_token',
          expiry_date: Date.now() + 3600000,
        },
      });

      const result = await refreshAccessToken('refresh_token_123');

      expect(result.accessToken).toBe('new_access_token');
      expect(result.expiryDate).toBeGreaterThan(Date.now());
    });

    it('should throw error when refresh fails', async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {},
      });

      await expect(refreshAccessToken('invalid_refresh')).rejects.toThrow(
        'Failed to refresh access token'
      );
    });

    it('should use default expiry if not provided', async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new_token',
        },
      });

      const result = await refreshAccessToken('refresh_token');

      expect(result.expiryDate).toBeGreaterThan(Date.now());
    });

    it('should set credentials before refreshing', async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new_token',
          expiry_date: Date.now() + 3600000,
        },
      });

      await refreshAccessToken('my_refresh_token');

      expect(mockSetCredentials).toHaveBeenCalledWith({
        refresh_token: 'my_refresh_token',
      });
    });
  });

  describe('getUserEmail()', () => {
    it('should fetch user email successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'user@gmail.com' }),
      });

      const email = await getUserEmail('access_token');

      expect(email).toBe('user@gmail.com');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('userinfo'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer access_token' },
        })
      );
    });

    it('should throw error when fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(getUserEmail('invalid_token')).rejects.toThrow(
        'Failed to fetch user info'
      );
    });

    it('should throw error when no email in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(getUserEmail('access_token')).rejects.toThrow('No email found');
    });

    it('should throw error when email is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ email: '' }),
      });

      await expect(getUserEmail('access_token')).rejects.toThrow('No email found');
    });
  });

  describe('revokeToken()', () => {
    it('should revoke token successfully', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await expect(revokeToken('access_token')).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('revoke'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should not throw when revoke request fails', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      // Should not throw - revocation failure is non-blocking
      await expect(revokeToken('invalid_token')).resolves.not.toThrow();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Should not throw - handles error gracefully
      await expect(revokeToken('access_token')).resolves.not.toThrow();
    });

    it('should include token in revoke URL', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await revokeToken('my_access_token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('token=my_access_token'),
        expect.any(Object)
      );
    });
  });
});

