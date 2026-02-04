# SMTP to Gmail OAuth Relay

An SMTP server that accepts emails via standard SMTP protocol and relays them through Gmail's API using OAuth 2.0 authentication.

## Overview

```
Email Sequencer → SMTP → This Relay → OAuth → Gmail API → Email Delivered
```

This relay acts as a bridge between traditional SMTP-based email clients/sequencers and Gmail's OAuth-based API. Existing email sequencer connect via SMTP (port 2525), and the relay handles all OAuth complexity transparently and delivers email through Gmail API.

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
├── smtp/smtp-server.ts       ─────▶  SMTP Server (Port 2525) - Receives emails
├── gmail/gmail-client.ts     ─────▶  Gmail Client - Sends via Gmail API  
├── oauth/
│   ├── google-oauth-client.ts ────▶  OAuth Client - Token management
│   ├── routes.ts              ────▶  Express Routes - /auth/* endpoints
│   └── http-server.ts         ────▶  HTTP Server (Port 3000) - Web interface
├── db/
│   ├── accounts-schema.ts     ────▶  SQLite schema definition
│   └── repositories/          ────▶  SQLite - Accounts & tokens storage
└── utils/
    ├── crypto.ts              ────▶  AES-256-GCM encryption utilities
    └── logger.ts              ────▶  Winston logger with file rotation
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **SMTP Server** | `src/smtp/smtp-server.ts` | Accepts SMTP connections, authenticates users via API key |
| **Gmail Client** | `src/gmail/gmail-client.ts` | Sends emails via Gmail API, handles token refresh |
| **OAuth Client** | `src/oauth/google-oauth-client.ts` | Manages OAuth flow, token exchange, refresh |
| **HTTP Server** | `src/oauth/http-server.ts` | Web interface for account registration |
| **Account Repository** | `src/db/repositories/account-repository.ts` | CRUD operations for accounts and tokens |
| **Crypto Utils** | `src/utils/crypto.ts` | AES-256-GCM encryption for tokens |
| **Logger** | `src/utils/logger.ts` | Winston logger with console and file output |

### Security Features

- **API Keys**: Hashed with bcrypt before storage
- **OAuth Tokens**: Encrypted with AES-256-GCM at rest
- **Token Refresh**: Automatic refresh before expiry (5-minute buffer)

### Database Schema

The SQLite database stores registered accounts with the following schema:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key (auto-increment) |
| `email` | TEXT | Gmail address (unique, indexed) |
| `refresh_token` | TEXT | Encrypted OAuth refresh token |
| `access_token` | TEXT | Encrypted OAuth access token |
| `token_expiry` | INTEGER | Token expiration timestamp (Unix) |
| `api_key` | TEXT | Bcrypt-hashed API key |
| `created_at` | INTEGER | Account creation timestamp |
| `updated_at` | INTEGER | Last update timestamp |

### Logging

Winston logger with multiple transports:

- **Console**: Colorized output with format `[HH:mm:ss] level [Component] message`
- **File**: JSON logs with rotation (5MB error.log, 10MB combined.log)

Log files are stored in `logs/` directory. Set `LOG_LEVEL` environment variable to control verbosity (`debug`, `info`, `warn`, `error`).

---

## Google Cloud Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter a project name (e.g., "SMTP Gmail Relay")
4. Click **Create** and then select the project

### Step 2: Enable Gmail API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click **Gmail API** → **Enable**

### Step 3: Configure OAuth Consent (Google Auth Platform)

1. Go to **APIs & Services** → **OAuth consent screen**
   - Opens **Google Auth platform** setup
2. Click **Get started** (or **Configure**) if prompted
3. Complete **Branding / App information**:
   - **App name**: SMTP Gmail Relay
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. Go to **Audience**:
   - Select **External** (or Internal if using Google Workspace)
   - Keep **Publishing status** as **Testing**
   - Add **Test users** (the Gmail accounts you will use for testing/sending mails through the relay)
6. Click **Save and Continue**
7. Go to **Data access** → **Add or remove scopes**
8. Add these scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/userinfo.email`
9. Click **Save / Update** → **Save and Continue** → **Back to Dashboard**

### Step 4: Create OAuth Credentials (Google Auth Platform → Clients)

1. Go to **Google Auth platform** → **Clients**
   - Some accounts show this under **APIs & Services** → **Credentials**, then you will see **Clients**
2. Click **Create client** (or **+ Create client**)
3. Select **Web application**
4. Set:
   - **Name**: SMTP Relay Client
   - Under **Authorized redirect URIs**, add:
     ```
     http://localhost:3000/auth/callback
     ```
5. Click **Create**
6. **Save the Client ID and Client Secret** — you will add these to your `.env` file later:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

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

Edit `.env` with your Google Cloud credentials (generated from last step in Google Cloud Setup):

```env
# Google OAuth (from Step 4 above)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Server Ports
SMTP_PORT=2525
SMTP_HOST=0.0.0.0
HTTP_PORT=3000

# Database
DATABASE_PATH=./data/relay.db

# Security - ENCRYPTION_KEY is required for encrypting OAuth tokens
# Generate a random 64-character hex key (See Generate Encryption Key below for details)
ENCRYPTION_KEY=your-64-character-hex-key-here

# Test credentials (added after registration - see Usage section)
TEST_SENDER_EMAIL=your-registered@gmail.com
TEST_SENDER_API_KEY=sk_your_api_key_here
```

#### Generate Encryption Key

Run this command in **PowerShell(Windows)** or **Terminal(macOS)** (in your project directory):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This outputs a 64-character hex string. Copy it and paste as your `ENCRYPTION_KEY` value.

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

**For test scripts:** After getting your API key, add these credentials to your `.env` file:

```env
TEST_SENDER_EMAIL=your-registered@gmail.com
TEST_SENDER_API_KEY=sk_your_api_key_here
```

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

> **Note:** After starting the server, open another terminal to run these commands.

**Linux/Mac:**
```bash
# First time only: make the script executable
chmod +x send-test.sh

# Run the test
./send-test.sh recipient@example.com "Test Subject" "Hello, this is a test email"
```

**Windows (PowerShell):**
```powershell
.\send-test.ps1 recipient@example.com "Test Subject" "Hello, this is a test email"
```

**Command Format:**
```
./send-test.sh <recipient> <subject> <body>
```

| Argument | Description | Example |
|----------|-------------|---------|
| `recipient` | Email address to send to | `john@example.com` |
| `subject` | Email subject line | `"Hello from Relay"` |
| `body` | Email body content | `"This is a test email"` |

**Example:**
```bash
# Linux/Mac
./send-test.sh john@example.com "Meeting Reminder" "Don't forget our meeting at 3pm"

# Windows PowerShell
.\send-test.ps1 john@example.com "Meeting Reminder" "Don't forget our meeting at 3pm"
```

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
│   ├── config/                    # Environment configuration
│   │   ├── index.ts               # Zod schema validation
│   │   └── index.test.ts          # Config unit tests
│   ├── constants/                 # Application constants
│   │   └── google-api.ts          # Google API URLs and scopes
│   ├── db/                        # Database layer
│   │   ├── index.ts               # SQLite connection setup
│   │   ├── accounts-schema.ts     # Table definitions
│   │   └── repositories/
│   │       ├── account-repository.ts       # Account CRUD operations
│   │       └── account-repository.test.ts  # Repository unit tests
│   ├── gmail/                     # Gmail API integration
│   │   ├── gmail-client.ts        # Send emails, token refresh
│   │   └── gmail-client.test.ts   # Gmail client unit tests
│   ├── oauth/                     # OAuth flow
│   │   ├── google-oauth-client.ts       # Google OAuth operations
│   │   ├── google-oauth-client.test.ts  # OAuth client unit tests
│   │   ├── routes.ts              # Express routes (/auth/*)
│   │   ├── routes.test.ts         # Routes unit tests
│   │   ├── http-server.ts         # HTTP server setup
│   │   └── http-server.test.ts    # HTTP server unit tests
│   ├── smtp/                      # SMTP server
│   │   ├── smtp-server.ts         # SMTP listener, auth
│   │   └── smtp-server.test.ts    # SMTP server unit tests
│   ├── utils/                     # Utilities
│   │   ├── crypto.ts              # AES-256-GCM encryption
│   │   ├── crypto.test.ts         # Crypto unit tests
│   │   └── logger.ts              # Winston logger
│   └── index.ts                   # Entry point
├── scripts/
│   ├── send-test.ts               # Test email CLI script
│   └── load-test.ts               # Load testing script
├── send-test.sh                   # Bash wrapper for send-test
├── send-test.ps1                  # PowerShell wrapper for send-test
├── data/                          # SQLite database (gitignored)
├── logs/                          # Application logs (gitignored)
├── coverage/                      # Test coverage reports (gitignored)
└── dist/                          # Compiled JS (gitignored)
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
