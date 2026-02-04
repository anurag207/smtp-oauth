/**
 * Unit Tests for OAuth HTTP Server
 *
 * Tests Express app creation and endpoints.
 */

import request from 'supertest';
import { Request, Response } from 'express';

// Mock config
jest.mock('../config', () => ({
  config: {
    smtpPort: 2525,
    httpPort: 3000,
  },
}));

// Mock routes
jest.mock('./routes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/register', (_req: Request, res: Response) => res.redirect('https://google.com'));
  return { authRoutes: router };
});

import { createOAuthServer } from './http-server';

describe('OAuth HTTP Server', () => {
  describe('createOAuthServer()', () => {
    it('should create Express application', () => {
      const app = createOAuthServer();
      expect(app).toBeDefined();
    });
  });

  describe('GET /', () => {
    it('should return home page with status 200', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/');

      expect(response.status).toBe(200);
    });

    it('should return HTML content', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/');

      expect(response.type).toMatch(/html/);
    });

    it('should contain registration link', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/');

      expect(response.text).toContain('/auth/register');
    });

    it('should contain service title', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/');

      expect(response.text).toContain('SMTP to Gmail OAuth Relay');
    });

    it('should show SMTP port', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/');

      expect(response.text).toContain('2525');
    });

    it('should contain instructions', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/');

      expect(response.text).toContain('Register');
      expect(response.text).toContain('Gmail');
    });
  });

  describe('GET /health', () => {
    it('should return status 200', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
    });

    it('should return JSON content', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/health');

      expect(response.type).toMatch(/json/);
    });

    it('should have status ok', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should have service name', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('service', 'smtp-gmail-oauth-relay');
    });

    it('should have timestamp', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('GET /auth/register', () => {
    it('should redirect to OAuth URL', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/auth/register');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('google.com');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const app = createOAuthServer();

      const response = await request(app).get('/nonexistent');

      expect(response.status).toBe(404);
    });
  });
});

