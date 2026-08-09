# Threat Model

## Scope

This threat model covers the current monorepo application:

- Express backend in `02-backend/server`
- React/Vite frontend in `03-frontend/web`
- SQLite-backed restaurant data
- Optional server-side OpenAI integration

It does not cover external POS vendors, Railway account security, GitHub account security, or a future managed database provider.

## Assets

- Owner, manager, and viewer accounts
- Organization, restaurant, and branch data
- Orders, refunds, menu items, inventory, reports, chat messages, feedback, and knowledge documents
- JWT signing secret
- OpenAI API key
- Production database file
- Deployment configuration

## Actors

- Restaurant owner: trusted for their organization.
- Branch manager: trusted only for assigned branch operations.
- Viewer: read-only user.
- Anonymous internet user: untrusted.
- Malicious tenant: authenticated user attempting to access another restaurant.
- Compromised browser/client: untrusted client that may tamper with IDs or payloads.

## Entry points

- `/api/auth/register`
- `/api/auth/login`
- Authenticated `/api/*` endpoints
- CSV import payloads
- Knowledge import payloads
- Chat and AI action confirmation endpoints
- Static frontend assets in production

## Threats and mitigations

| Threat | Risk | Current mitigation | Proof |
| --- | --- | --- | --- |
| Anonymous access to private APIs | Data exposure | Bearer JWT middleware on private routes | `security.test.js` |
| Forged or expired JWT | Account takeover | HS256 verification, issuer, audience, expiration, tenant ID checks | `security.test.js` |
| Cross-restaurant ID tampering | Tenant data exposure/mutation | Server-side organization and restaurant checks | `security.test.js` |
| Branch manager accessing another branch | Branch data exposure/mutation | Branch queries scoped to assigned branch | `security.test.js` |
| Viewer mutating protected resources | Unauthorized writes | Role-based authorization middleware | `security.test.js` |
| Browser from unapproved origin calling API | CSRF-like browser abuse and unwanted embedding | CORS allow-list and no credentials | `security.test.js` |
| XSS impact amplification | Token/data theft | CSP and security headers | `security.test.js` checks header presence |
| Oversized request body | Memory pressure / denial of service | Express JSON body size limit | `security.test.js` |
| Malformed JSON | Parser errors leaking internals | Sanitized parse error responses | `security.test.js` |
| Stack traces or secrets in API errors | Secret leakage | Sanitized global error handler | `security.test.js` checks body errors |
| Brute-force login | Account compromise | Authentication rate limiter | Implemented; no dedicated proof test yet |
| High-rate API abuse | Service degradation | API rate limiter | Implemented; no dedicated proof test yet |
| SQL injection | Data exposure/mutation | Prepared statements and zod validation | Not exhaustively fuzz-tested |
| Unsafe file/path upload | Path traversal or storage abuse | Current APIs accept text payloads, not arbitrary upload paths | Not applicable to current endpoints |
| OpenAI secret exposure | Credential theft | OpenAI key is read server-side only and must not be logged | Covered by code review, not by automated secret scanner |

## Residual risks

- SQLite is acceptable for MVP but needs backup/restore, retention, and operational monitoring before real customers.
- Rate limiting is in-memory; it should move to Redis or provider-level rate limiting for multi-instance deployment.
- Import validation is strong for known CSV columns, but CSV/XLSX adversarial fuzz testing is still needed.
- Security logging is local process logging only; production should ship sanitized logs to a monitored service.
- Secret scanning should be enabled in GitHub and CI.
- Authorization should be expanded into policy tests for every write endpoint as the API grows.

## Review cadence

Update this document whenever:

- A new API route is added.
- A new role or permission is introduced.
- A new upload/import format is supported.
- Deployment infrastructure changes.
- The database moves from SQLite to a managed database.
