# SMTP to Gmail OAuth Relay

An SMTP server that accepts emails via standard SMTP protocol and relays them through Gmail's API using OAuth 2.0 authentication.

## Overview

```
Email Sequencer → SMTP → This Relay → OAuth → Gmail API → Email Delivered
```

This relay acts as a bridge between traditional SMTP-based email clients/sequencers and Gmail's OAuth-based API. Your existing email tools connect via SMTP (port 2525), and the relay handles all OAuth complexity transparently.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **Database**: SQLite (via better-sqlite3)
- **SMTP Server**: smtp-server
- **OAuth**: google-auth-library

## Architecture

### Flow 1: Email Sending (Runtime)

```
┌────────────────┐      SMTP (Port 2525)      ┌─────────────────────────────────────┐
│                │  ─────────────────────────▶│           SMTP SERVER               │
│  Email Client  │   Username: user@gmail.com │  1. Parse SMTP connection           │
│  / Sequencer   │   Password: sk_api_key     │  2. Verify API key (bcrypt)         │
│                │                            │  3. Extract email content           │
└────────────────┘                            └──────────────┬──────────────────────┘
                                                             │
                                                             ▼
┌────────────────┐                            ┌─────────────────────────────────────┐
│                │      HTTPS (REST API)      │           GMAIL CLIENT              │
│   Gmail API    │◀─────────────────────────  │  1. Get/refresh access token        │
│   (Google)     │   Authorization: Bearer    │  2. Build RFC 2822 email            │
│                │   {access_token}           │  3. Send via Gmail API              │
└────────────────┘                            └──────────────┬──────────────────────┘
                                                             │
                                                             ▼
                                              ┌─────────────────────────────────────┐
                                              │           SQLITE DATABASE           │
                                              │  • API keys (hashed)                │
                                              │  • Access tokens (encrypted)        │
                                              │  • Refresh tokens (encrypted)       │
                                              └─────────────────────────────────────┘
```

### Flow 2: Account Registration (One-time Setup)

```
┌────────────────┐      HTTP (Port 3000)      ┌─────────────────────────────────────┐
│                │  ────────────────────────▶ │           HTTP SERVER               │
│    Browser     │   GET /auth/register       │  Express routes for OAuth flow      │
│                │                            │                                     │
└────────────────┘                            └──────────────┬──────────────────────┘
        ▲                                                    │
        │                                                    ▼
        │                                     ┌─────────────────────────────────────┐
        │         Redirect to Google          │           OAUTH CLIENT              │
        │◀─────────────────────────────────── │  1. Generate auth URL               │
        │         OAuth Consent Screen        │  2. Exchange code for tokens        │
        │                                     │  3. Get user email from Google      │
        │                                     └──────────────┬──────────────────────┘
        │                                                    │
        │         Redirect back with code                    ▼
        │─────────────────────────────────▶   ┌─────────────────────────────────────┐
        │         GET /auth/callback?code=    │           SQLITE DATABASE           │
        │                                     │  Store:                             │
        │◀─────────────────────────────────── │  • Email + hashed API key           │
                  Show API Key                │  • Encrypted refresh token          │
                  (display once)              └─────────────────────────────────────┘
```

### Component Overview

```
src/
├── smtp/server.ts      ─────▶  SMTP Server (Port 2525) - Receives emails
├── gmail/client.ts     ─────▶  Gmail Client - Sends via Gmail API  
├── oauth/
│   ├── client.ts       ─────▶  OAuth Client - Token management
│   ├── routes.ts       ─────▶  Express Routes - /auth/* endpoints
│   └── http-server.ts  ─────▶  HTTP Server (Port 3000) - Web interface
└── db/
    └── repositories/   ─────▶  SQLite - Accounts & tokens storage
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **SMTP Server** | `src/smtp/server.ts` | Accepts SMTP connections, authenticates users via API key |
| **Gmail Client** | `src/gmail/client.ts` | Sends emails via Gmail API, handles token refresh |
| **OAuth Client** | `src/oauth/client.ts` | Manages OAuth flow, token exchange, refresh |
| **HTTP Server** | `src/oauth/http-server.ts` | Web interface for account registration |
| **Account Repository** | `src/db/repositories/` | CRUD operations for accounts and tokens |

### Security Features

- **API Keys**: Hashed with bcrypt before storage
- **OAuth Tokens**: Encrypted with AES-256-GCM at rest
- **Token Refresh**: Automatic refresh before expiry (5-minute buffer)

---

## Google Cloud Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter a project name (e.g., "SMTP Gmail Relay")
4. Click **Create**

### Step 2: Enable Gmail API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click **Gmail API** → **Enable**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (or Internal if using Google Workspace)
3. Fill in the required fields:
   - **App name**: SMTP Gmail Relay
   - **User support email**: Your email
   - **Developer contact**: Your email
4. Click **Save and Continue**
5. On **Scopes** page, click **Add or Remove Scopes**
6. Add these scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/userinfo.email`
7. Click **Save and Continue**
8. On **Test users** page, add the Gmail accounts you'll use for testing
9. Click **Save and Continue** → **Back to Dashboard**

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Set name: "SMTP Relay Client"
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/auth/callback
   ```
6. Click **Create**
7. **Save the Client ID and Client Secret** - you'll need these!

---

## Installation

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/smtp-to-gmail-oauth-relay.git
cd smtp-to-gmail-oauth-relay

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configure Environment Variables

Edit `.env` with your Google Cloud credentials:

```env
# Google OAuth (from Step 4 above)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Server Ports
SMTP_PORT=2525
HTTP_PORT=3000

# Database
DATABASE_PATH=./data/relay.db

# Security - Generate a random 64-character hex key:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-character-hex-key-here
```

---

## Running the Server

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

The server will start:
- **SMTP Server**: Port 2525
- **OAuth/HTTP Server**: Port 3000

---

## Usage

### Step 1: Register Your Gmail Account

1. Open http://localhost:3000/auth/register
2. Sign in with your Google account
3. Grant permission to send emails on your behalf
4. **Save your API Key** - it's shown only once!

### Step 2: Configure Your Email Client/Sequencer

Use these SMTP settings:

| Setting | Value |
|---------|-------|
| **SMTP Host** | `localhost` (or your server IP) |
| **SMTP Port** | `2525` |
| **Username** | Your registered Gmail address |
| **Password** | Your API Key (e.g., `sk_abc123...`) |
| **Encryption** | None (or STARTTLS if configured) |

### Step 3: Send Emails

Your email client sends via SMTP → Relay forwards via Gmail API → Email delivered!

---

## Testing

### Quick Test Setup

1. Add test credentials to `.env`:
   ```env
   TEST_SENDER_EMAIL=your-registered@gmail.com
   TEST_SENDER_API_KEY=sk_your_api_key
   ```

2. Start the server:
   ```bash
   npm run dev
   ```

### Send a Test Email

**Linux/Mac:**
```bash
./send-test.sh recipient@example.com "Test Subject" "Hello, this is a test email"
```

**Windows (PowerShell):**
```powershell
.\send-test.ps1 recipient@example.com "Test Subject" "Hello, this is a test email"
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `recipient` | Email address to send to |
| `subject` | Email subject line |
| `body` | Email body content |

### Run Unit Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Project Structure

```
smtp-to-gmail-oauth-relay/
├── src/
│   ├── config/              # Environment configuration
│   │   └── index.ts         # Zod schema validation
│   ├── constants/           # Application constants
│   │   └── google-api.ts    # Google API URLs and scopes
│   ├── db/                  # Database layer
│   │   ├── index.ts         # SQLite connection
│   │   ├── accounts.schema.ts
│   │   └── repositories/
│   │       └── account.repository.ts
│   ├── gmail/               # Gmail API integration
│   │   └── client.ts        # Send emails, token refresh
│   ├── oauth/               # OAuth flow
│   │   ├── client.ts        # Google OAuth operations
│   │   ├── routes.ts        # Express routes
│   │   └── http-server.ts   # HTTP server setup
│   ├── smtp/                # SMTP server
│   │   └── server.ts        # SMTP listener, auth
│   ├── utils/               # Utilities
│   │   ├── crypto.ts        # Encryption/decryption
│   │   └── logger.ts        # Winston logger
│   └── index.ts             # Entry point
├── scripts/
│   ├── send-test.ts         # Test email script
│   └── load-test.ts         # Load testing script
├── send-test.sh             # Bash wrapper
├── send-test.ps1            # PowerShell wrapper
├── data/                    # SQLite database (gitignored)
├── logs/                    # Application logs (gitignored)
└── dist/                    # Compiled JS (gitignored)
```

---

## API Reference

### SMTP Authentication

- **Method**: PLAIN authentication
- **Username**: Registered Gmail address
- **Password**: API Key (format: `sk_` + 32 random characters)

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Home page with instructions |
| `/auth/register` | GET | Start OAuth registration flow |
| `/auth/callback` | GET | OAuth callback (handled automatically) |
| `/auth/regenerate` | GET | Regenerate API key |
| `/health` | GET | Health check endpoint |

---

## Troubleshooting

### "Account not registered"
- Register your Gmail at http://localhost:3000/auth/register

### "Invalid API key"
- Verify you're using the correct API key for the email address
- API keys start with `sk_`

### "Gmail API permission denied"
- Ensure you granted "Send email" permission during registration
- Try re-registering (this will regenerate your API key)

### "Token refresh failed"
- The refresh token may have been revoked
- Re-register at http://localhost:3000/auth/register

---

## License

MIT
