# SMTP to Gmail OAuth Relay

An SMTP server that accepts email via standard SMTP protocol and relays them through Gmail's API using OAuth 2.0 authentication.

## Overview

```
Email Sequencer → SMTP → This Relay → OAuth → Gmail API → Email Delivered
```

## Status

🚧 Under Development

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **Database**: SQLite

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Run in development mode
npm run dev
```

## Project Structure

```
src/           # TypeScript source files
scripts/       # Test and utility scripts
data/          # SQLite database (gitignored)
dist/          # Compiled JavaScript (gitignored)
```

## Testing

### Prerequisites

1. Start the relay server:
   ```bash
   npm run dev
   ```

2. Register your Gmail account at: http://localhost:3000/auth/register

3. Save your SMTP Password (API Key) displayed after registration

4. Add your credentials to `.env`:
   ```
   TEST_SENDER_EMAIL=your-registered@gmail.com
   TEST_SENDER_API_KEY=sk_your_api_key
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

**Windows (Git Bash):**
```bash
bash send-test.sh recipient@example.com "Test Subject" "Hello, this is a test email"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `recipient` | Email address to send to |
| `subject` | Email subject line |
| `body` | Email body content |

The sender email and API key are read from your `.env` file.

## License

MIT

