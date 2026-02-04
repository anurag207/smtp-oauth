/**
 * Unit Tests for SMTP Server
 *
 * Tests server creation, authentication, and lifecycle.
 * Mocks smtp-server library and dependencies.
 */

/**
 * Interface for captured SMTP server options during testing
 */
interface MockServerOptions {
  authOptional: boolean;
  authMethods: string[];
  disabledCommands: string[];
  onAuth: (
    auth: { username: string; password: string },
    session: MockSession,
    callback: (err: Error | null, response?: { user: string }) => void
  ) => void;
  onData: (
    stream: unknown,
    session: MockSession,
    callback: (err?: Error | null) => void
  ) => void;
  onConnect: (session: { remoteAddress: string }, callback: () => void) => void;
  onClose: (session: { remoteAddress: string }) => void;
}

/**
 * Mock session interface for testing
 */
interface MockSession {
  remoteAddress: string;
  userEmail?: string;
  apiKey?: string;
}

// Store mock options for testing
let lastServerOptions: MockServerOptions | null = null;

/**
 * Helper to get server options with null check
 * Throws if options haven't been captured yet
 */
function getServerOptions(): MockServerOptions {
  if (!lastServerOptions) {
    throw new Error('Server options not captured - createSmtpServer must be called first');
  }
  return lastServerOptions;
}

// Mock smtp-server
const mockListen = jest.fn();
const mockClose = jest.fn();
const mockOn = jest.fn();

jest.mock('smtp-server', () => ({
  SMTPServer: jest.fn().mockImplementation((options) => {
    lastServerOptions = options;
    return {
      listen: mockListen,
      close: mockClose,
      on: mockOn,
    };
  }),
}));

// Mock mailparser
jest.mock('mailparser', () => ({
  simpleParser: jest.fn(),
}));

// Mock dependencies
jest.mock('../db/repositories/account-repository');
jest.mock('../gmail/gmail-client');
jest.mock('../utils/logger', () => ({
  smtpLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { SMTPServer } from 'smtp-server';
import {
  createSmtpServer,
  startSmtpServer,
  stopSmtpServer,
  SmtpServerConfig,
} from './smtp-server';
import { verifyApiKey, getAccountByEmail } from '../db/repositories/account-repository';

describe('SMTP Server', () => {
  const testConfig: SmtpServerConfig = {
    port: 2525,
    host: '127.0.0.1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    lastServerOptions = null;
    mockListen.mockImplementation((_port, _host, callback) => callback());
    mockClose.mockImplementation((callback) => callback());
  });

  describe('createSmtpServer()', () => {
    it('should create SMTP server with authentication required', () => {
      const server = createSmtpServer(testConfig);

      expect(SMTPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          authOptional: false,
        })
      );
      expect(server).toBeDefined();
    });

    it('should configure PLAIN and LOGIN auth methods', () => {
      createSmtpServer(testConfig);

      expect(getServerOptions().authMethods).toEqual(['PLAIN', 'LOGIN']);
    });

    it('should disable STARTTLS for local development', () => {
      createSmtpServer(testConfig);

      expect(getServerOptions().disabledCommands).toContain('STARTTLS');
    });

    it('should configure onAuth handler', () => {
      createSmtpServer(testConfig);

      const options = getServerOptions();
      expect(options.onAuth).toBeDefined();
      expect(typeof options.onAuth).toBe('function');
    });

    it('should configure onData handler', () => {
      createSmtpServer(testConfig);

      const options = getServerOptions();
      expect(options.onData).toBeDefined();
      expect(typeof options.onData).toBe('function');
    });

    it('should configure onConnect handler', () => {
      createSmtpServer(testConfig);

      const options = getServerOptions();
      expect(options.onConnect).toBeDefined();
      expect(typeof options.onConnect).toBe('function');
    });

    it('should configure onClose handler', () => {
      createSmtpServer(testConfig);

      const options = getServerOptions();
      expect(options.onClose).toBeDefined();
      expect(typeof options.onClose).toBe('function');
    });
  });

  describe('startSmtpServer()', () => {
    it('should start server on specified port and host', async () => {
      const server = createSmtpServer(testConfig);

      await startSmtpServer(server, testConfig);

      expect(mockListen).toHaveBeenCalledWith(2525, '127.0.0.1', expect.any(Function));
    });

    it('should resolve when server starts successfully', async () => {
      const server = createSmtpServer(testConfig);

      await expect(startSmtpServer(server, testConfig)).resolves.toBeUndefined();
    });

    it('should reject on server error', async () => {
      const server = createSmtpServer(testConfig);
      const testError = new Error('Port in use');

      mockListen.mockImplementation(() => {
        // Don't call callback
      });
      mockOn.mockImplementation((event, handler) => {
        if (event === 'error') {
          setTimeout(() => handler(testError), 10);
        }
      });

      await expect(startSmtpServer(server, testConfig)).rejects.toThrow('Port in use');
    });
  });

  describe('stopSmtpServer()', () => {
    it('should stop server gracefully', async () => {
      const server = createSmtpServer(testConfig);

      await stopSmtpServer(server);

      expect(mockClose).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should resolve when server stops', async () => {
      const server = createSmtpServer(testConfig);

      await expect(stopSmtpServer(server)).resolves.toBeUndefined();
    });
  });

  describe('onAuth handler', () => {
    const mockAccount = {
      id: 1,
      email: 'test@gmail.com',
      api_key: 'hashed_key',
      refresh_token: 'token',
      access_token: null,
      token_expiry: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('should authenticate valid credentials', () => {
      createSmtpServer(testConfig);

      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (verifyApiKey as jest.Mock).mockReturnValue(mockAccount);

      const callback = jest.fn();
      const session: MockSession = { remoteAddress: '127.0.0.1' };

      getServerOptions().onAuth(
        { username: 'test@gmail.com', password: 'sk_valid_key' },
        session,
        callback
      );

      expect(callback).toHaveBeenCalledWith(null, { user: 'test@gmail.com' });
      expect(session.userEmail).toBe('test@gmail.com');
      expect(session.apiKey).toBe('sk_valid_key');
    });

    it('should reject missing username', () => {
      createSmtpServer(testConfig);

      const callback = jest.fn();

      getServerOptions().onAuth(
        { username: '', password: 'password' },
        { remoteAddress: '127.0.0.1' },
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('required'),
        })
      );
    });

    it('should reject missing password', () => {
      createSmtpServer(testConfig);

      const callback = jest.fn();

      getServerOptions().onAuth(
        { username: 'test@gmail.com', password: '' },
        { remoteAddress: '127.0.0.1' },
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('required'),
        })
      );
    });

    it('should reject unregistered account', () => {
      createSmtpServer(testConfig);

      (getAccountByEmail as jest.Mock).mockReturnValue(null);

      const callback = jest.fn();

      getServerOptions().onAuth(
        { username: 'unknown@gmail.com', password: 'key' },
        { remoteAddress: '127.0.0.1' },
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('not registered'),
        })
      );
    });

    it('should reject invalid API key', () => {
      createSmtpServer(testConfig);

      (getAccountByEmail as jest.Mock).mockReturnValue(mockAccount);
      (verifyApiKey as jest.Mock).mockReturnValue(null);

      const callback = jest.fn();

      getServerOptions().onAuth(
        { username: 'test@gmail.com', password: 'wrong_key' },
        { remoteAddress: '127.0.0.1' },
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Invalid API key'),
        })
      );
    });

    it('should handle empty credentials (simulating undefined)', () => {
      createSmtpServer(testConfig);

      const callback = jest.fn();

      // Test with empty strings (SMTP server treats empty same as missing)
      getServerOptions().onAuth(
        { username: '', password: '' },
        { remoteAddress: '127.0.0.1' },
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('required'),
        })
      );
    });
  });

  describe('onConnect handler', () => {
    it('should accept connections', () => {
      createSmtpServer(testConfig);

      const callback = jest.fn();
      const session = { remoteAddress: '192.168.1.100' };

      getServerOptions().onConnect(session, callback);

      expect(callback).toHaveBeenCalledWith();
    });
  });

  describe('onClose handler', () => {
    it('should handle client disconnection', () => {
      createSmtpServer(testConfig);

      const session = { remoteAddress: '192.168.1.100' };

      // Should not throw
      expect(() => getServerOptions().onClose(session)).not.toThrow();
    });
  });
});

