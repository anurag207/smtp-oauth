# Project Write-up
## What was the hardest part?

The most challenging aspect was designing a secure and user-friendly OAuth registration flow. Since SMTP authentication only supports username/password, I needed to bridge the gap between OAuth's token-based system and SMTP's simpler auth model. Implementing proper security—bcrypt hashing for API keys and AES-256-GCM encryption for tokens—added complexity to operations like re-registration and API key regeneration, requiring careful handling of encrypted data throughout the flow. Handling edge cases—like users denying the `gmail.send` scope, refreshing the callback page (which reuses the authorization code), or needing to regenerate lost API keys—required careful UX consideration and proper error handling to guide users back to a working state.

## What would you do differently with more time?

With more time, I would implement several improvements: (1) **In-memory caching** (using node-cache or Redis) for frequently accessed accounts to reduce database queries during high-volume sending.(2) **Rate limiting** per account to prevent abuse and stay within Gmail API quotas. (3) **TLS/STARTTLS support** for the SMTP server to encrypt credentials in transit. (4) **Webhook notifications** for delivery status and bounce handling. The current architecture is designed to accommodate these additions without major refactoring.

## Assumptions made

- **API key as SMTP password**: Users authenticate with a server-generated API key rather than passing OAuth tokens directly via SMTP. This provides better security (tokens never leave the server) and simpler client configuration.
- **Trusted network**: SMTP connections are unencrypted (no TLS), assuming deployment behind a firewall or VPN. Production deployment would require TLS certificates.
- **Single-server deployment**: The relay is designed to run as a single instance with SQLite (per assignment requirement). The codebase keeps a clear separation between storage (repository layer) and business logic, so migrating to Postgres/MySQL for multi-instance deployments is straightforward. For distributed deployments, shared token/cache state should be externalized (e.g., Redis) and rate-limiting should be centralized.

