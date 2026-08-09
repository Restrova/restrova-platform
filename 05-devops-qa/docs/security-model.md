# Security Model

This document describes the security controls currently implemented in the AI Restaurant Manager monorepo. It only marks a control as proven when an automated test exists for it.

## Trust boundaries

- Browser clients are untrusted.
- All private restaurant APIs require backend-issued JWT authentication.
- OpenAI/API secrets, JWT secrets, database paths, and internal stack traces must remain server-side only.
- Restaurant, organization, and branch identifiers supplied by clients are treated as untrusted and re-checked against the authenticated user context.

## Proven controls

| Control | Implementation | Automated proof |
| --- | --- | --- |
| Secure HTTP headers | `helmet` with CSP, frame, referrer, no-sniff, and same-origin resource policy in `02-backend/server/src/index.js` | `02-backend/server/test/security.test.js` checks security headers |
| Restrictive CORS | Server allow-list from `CLIENT_ORIGIN`; unlisted origins receive `403` | `security.test.js` checks allowed and denied origins |
| Private API authentication | `auth` middleware requires a Bearer JWT before private routes | `security.test.js` checks `/api/dashboard` without a token |
| Invalid JWT rejection | JWT verification requires HS256, issuer, audience, and required tenant IDs | `security.test.js` checks an invalid token |
| Expired JWT rejection | JWTs are signed with `JWT_EXPIRES_IN` and verified by `jsonwebtoken` | `security.test.js` checks an expired token |
| Organization/restaurant isolation | Tenant-scoped queries require authenticated `organization_id` and `restaurant_id` | `security.test.js` blocks Restaurant A from editing Restaurant B |
| Branch isolation | Branch manager access is limited to the assigned branch | `security.test.js` checks branch manager branch visibility |
| Viewer mutation blocking | Viewer role cannot access protected write/import routes | `security.test.js` checks viewer import preview mutation denial |
| Malformed request bodies | JSON parse errors return sanitized `400` responses | `security.test.js` checks malformed JSON |
| Oversized payloads | JSON body size is limited by `REQUEST_BODY_LIMIT` | `security.test.js` checks oversized JSON rejection |
| Sensitive error sanitization | Error handler avoids stack traces and logs sanitized error type/status only | `security.test.js` checks no stack in body errors |

## Implemented controls not yet exhaustively proven

- Authentication and API rate limiting are implemented in `02-backend/server/src/index.js` with configurable limits.
- Password hashing cost is configurable through `BCRYPT_COST`; production requires a cost of at least 12.
- Production startup validates `JWT_SECRET` strength and rejects known placeholder values.
- SQL access uses prepared statements through `better-sqlite3`; dynamic table selection is constrained to internal table names in existing code.
- CSV imports use zod and parser validation before live import and require explicit confirmation.
- The application does not accept direct filesystem upload paths from users in the current backend API.

## Required production environment variables

```text
NODE_ENV=production
JWT_SECRET=<strong random secret, at least 32 characters>
DATABASE_PATH=/data/restaurant.db
CLIENT_ORIGIN=https://your-public-frontend.example
REQUEST_BODY_LIMIT=3mb
JWT_EXPIRES_IN=12h
BCRYPT_COST=12
API_RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_MS=900000
```

Optional OpenAI variables must never be logged or returned by APIs:

```text
OPENAI_API_KEY=<server-side only>
OPENAI_MODEL=<model name>
```

## Security test command

Run:

```bash
pnpm --filter server test:unit
```

The security tests live in:

```text
02-backend/server/test/security.test.js
```
