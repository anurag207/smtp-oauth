/**
 * Unit Tests for Gmail Client
 *
 * Tests email building, encoding, token management, and API interactions.
 * Mocks external dependencies (fetch, database, OAuth).
 */

// Mock dependencies before imports
jest.mock('../db/repositories/account-repository');
jest.mock('../oauth/google-oauth-client');
jest.mock('../utils/logger', () => ({
  gmailLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { sendEmailViaGmail, EmailMessage } from './gmail-client';
import {
  getAccountByEmail,
  updateAccessToken,
  getDecryptedAccessToken,
  getDecryptedRefreshToken,
} from '../db/repositories/account-repository';
import { refreshAccessToken } from '../oauth/google-oauth-client';

describe('Gmail Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmailViaGmail()', () => {
    const mockAccount = {
      id: 1,
      email: 'test@gmail.com',
      refresh_token: 'encrypted:refresh_token',
      access_token: 'encrypted:access_token',
      token_expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      api_key: 'hashed_key',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const mockMessage: EmailMessage = {
      from: 'test@gmail.com',
      to: 'recipient@example.com',
      subject: 'Test Subject',
      text: 'Test body content',
    };

    it('should send email successfully with valid cached token', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('decrypted_access_token');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg123',
          threadId: 'thread456',
          labelIds: ['SENT'],
        }),
      });

      const result = await sendEmailViaGmail('test@gmail.com', mockMessage);

      expect(result.messageId).toBe('msg123');
      expect(result.threadId).toBe('thread456');
      expect(result.senderEmail).toBe('test@gmail.com');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when expired', async () => {
      const expiredAccount = {
        ...mockAccount,
        token_expiry: Math.floor(Date.now() / 1000) - 100, // Expired
      };

      (getAccountByEmail as jest.Mock).mockReturnValue(expiredAccount);
      (getDecryptedRefreshToken as jest.Mock).mockReturnValue('decrypted_refresh');
      (refreshAccessToken as jest.Mock).mockResolvedValue({
        accessToken: 'new_access_token',
        expiryDate: Date.now() + 3600000,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg123',
          threadId: 'thread456',
          labelIds: ['SENT'],
        }),
      });

      await sendEmailViaGmail('test@gmail.com', mockMessage);

      expect(refreshAccessToken).toHaveBeenCalledWith('decrypted_refresh');
      expect(updateAccessToken).toHaveBeenCalled();
    });

    it('should refresh token when access token is null', async () => {
      const accountWithNoToken = {
        ...mockAccount,
        access_token: null,
        token_expiry: null,
      };

      (getAccountByEmail as jest.Mock).mockReturnValue(accountWithNoToken);
      (getDecryptedRefreshToken as jest.Mock).mockReturnValue('decrypted_refresh');
      (refreshAccessToken as jest.Mock).mockResolvedValue({
        accessToken: 'new_access_token',
        expiryDate: Date.now() + 3600000,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg123',
          threadId: 'thread456',
          labelIds: ['SENT'],
        }),
      });

      await sendEmailViaGmail('test@gmail.com', mockMessage);

      expect(refreshAccessToken).toHaveBeenCalled();
    });

    it('should throw error when account not found', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(null);

      await expect(sendEmailViaGmail('unknown@gmail.com', mockMessage)).rejects.toThrow(
        'Account not found'
      );
    });

    it('should handle Gmail API 401 error', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('access_token');

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token',
      });

      await expect(sendEmailViaGmail('test@gmail.com', mockMessage)).rejects.toThrow(
        'Gmail API authentication failed'
      );
    });

    it('should handle Gmail API 403 error', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('access_token');

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Permission denied',
      });

      await expect(sendEmailViaGmail('test@gmail.com', mockMessage)).rejects.toThrow(
        'Gmail API permission denied'
      );
    });

    it('should handle Gmail API 429 rate limit error', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('access_token');

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded',
      });

      await expect(sendEmailViaGmail('test@gmail.com', mockMessage)).rejects.toThrow(
        'Gmail API rate limit exceeded'
      );
    });

    it('should handle generic Gmail API error', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('access_token');

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      await expect(sendEmailViaGmail('test@gmail.com', mockMessage)).rejects.toThrow(
        'Gmail API error: 500'
      );
    });

    it('should override sender if from does not match authenticated email', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('access_token');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg123',
          threadId: 'thread456',
          labelIds: ['SENT'],
        }),
      });

      const messageWithDifferentFrom = {
        ...mockMessage,
        from: 'different@gmail.com',
      };

      const result = await sendEmailViaGmail('test@gmail.com', messageWithDifferentFrom);

      expect(result.senderEmail).toBe('test@gmail.com');
    });

    it('should send email with unicode subject', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('access_token');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg123',
          threadId: 'thread456',
          labelIds: ['SENT'],
        }),
      });

      const unicodeMessage = {
        ...mockMessage,
        subject: 'Hello 🎉 世界',
      };

      const result = await sendEmailViaGmail('test@gmail.com', unicodeMessage);

      expect(result.messageId).toBe('msg123');
      // Verify fetch was called with encoded email
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should send email with unicode body', async () => {
      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (getDecryptedAccessToken as jest.Mock).mockReturnValue('access_token');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg123',
          threadId: 'thread456',
          labelIds: ['SENT'],
        }),
      });

      const unicodeMessage = {
        ...mockMessage,
        text: 'Hello 🎉 世界 مرحبا',
      };

      const result = await sendEmailViaGmail('test@gmail.com', unicodeMessage);

      expect(result.messageId).toBe('msg123');
    });
  });
});

