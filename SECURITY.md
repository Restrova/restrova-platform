# Security policy

## Supported branch

Security fixes are accepted on `main`.

## Reporting a vulnerability

Do not open a public GitHub issue for a real vulnerability or leaked secret.

Send a private report to the repository owner with:

- A short description of the issue.
- Affected file/path or endpoint.
- Steps to reproduce.
- Impact assessment.
- Any safe proof of concept.

## Secret handling

Never commit or paste:

- `OPENAI_API_KEY`
- JWT secrets
- database files
- production `.env` files
- private restaurant exports
- copyrighted book text imported for a customer

If a secret is exposed, rotate it immediately and document the rotation in the relevant operations log.

## Production security baseline

Before real customer data is used, the deployment must have:

- Durable database storage and backups.
- Strong `JWT_SECRET`.
- HTTPS-only public access.
- Backend-only AI provider keys.
- Restricted production environment variable access.
- A tested restore process.

## API rate limiting

Each API/auth/import limiter uses a bounded, process-local client bucket. The API middleware counts requests across all paths: changing an ID, query or unknown URL cannot reset the quota. Authenticated import action buckets follow the owner ID; the global pre-auth API bucket uses the client IP. Expired buckets are pruned and a full bucket store fails closed instead of evicting active clients. Successful requests include limit/remaining/reset headers; HTTP 429 includes `Retry-After` and a sanitized error. Structured request logs retain the 429 status for monitoring without recording passwords or report bodies.

`RATE_LIMIT_WINDOW_MS` and limit values must be positive integers. Tune `API_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `IMPORT_PREVIEW_RATE_LIMIT_MAX` and `IMPORT_ACTION_RATE_LIMIT_MAX` for expected traffic. The production trust proxy setting assumes the existing single Render proxy boundary; do not expose the backend directly behind an untrusted forwarding chain. IP limits can be shared by users behind NAT.

These counters reset on process restart and are not shared between replicas. Before scaling horizontally, replace them with a shared atomic store or enforce quotas at the gateway. Restart the staging service to recover from an unexpectedly saturated bucket store, then investigate 429 logs and traffic rather than increasing limits blindly.
