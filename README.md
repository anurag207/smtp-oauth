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

## License

MIT

