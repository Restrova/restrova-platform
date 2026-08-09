# Enterprise readiness audit

Date: 2026-08-09
Audited commit: `fb1ed18` (`main`)
Previous stale audit commit: `45e1011`
Scope: current repository at HEAD after the enterprise repository foundation commit. This audit intentionally refreshes the earlier audit because `fb1ed18` changed repository tooling, CI, documentation, Docker, Render, and pnpm workflow foundations.

No application business behavior was changed for this refresh.

## Executive summary

The repository foundation is now materially stronger than the previous audit stated:

- pnpm is the canonical package manager.
- `packageManager` and Node/pnpm engine requirements are defined in `package.json`.
- Root commands exist for development, linting, formatting, typecheck, unit tests, integration tests, build, and full validation.
- `pnpm validate` runs the mandatory merge checks: lint, formatting check, typecheck hook, frontend tests, backend tests/evals, and build.
- GitHub Actions validation workflow exists at `.github/workflows/validate.yml`.
- CI installs with `pnpm install --frozen-lockfile`.
- `.github/CODEOWNERS`, pull request template, issue templates, `CONTRIBUTING.md`, `SECURITY.md`, and `CHANGELOG.md` exist.
- `docs/architecture`, `docs/adr`, `docs/operations`, and `docs/security` exist.
- Docker and Render now use pnpm.
- Developer-facing README files use pnpm commands.

The remaining enterprise blockers are no longer repository structure problems. The main risks now are production data durability/backups, formal migrations, tenant/branch context correctness, authentication/session hardening, import safety, financial accuracy, AI governance, observability, and production scalability.

## Severity and status key

- P0: security or data-loss issue.
- P1: required before real customers.
- P2: production quality improvement.
- P3: future scaling improvement.
- OPEN: still a genuine gap at `fb1ed18`.
- PARTIALLY RESOLVED: foundation work improved the issue, but meaningful risk remains.
- RESOLVED: current code/config proves the finding is addressed for this scope.

## Architecture snapshot at `fb1ed18`

| Area | Current state |
| --- | --- |
| Repository architecture | pnpm monorepo with team folders `02-backend`, `03-frontend`, `04-data-ai`, `05-devops-qa`, plus root enterprise docs and `.github` governance files. |
| Backend architecture | Single Express application in `02-backend/server/src/index.js`; database, AI, import, knowledge, and tool logic are split into modules. |
| Frontend architecture | React SPA with route shell and reusable UI components. Core product flow still routes to `LegacyWorkspacePage` / `LegacyApplication`. |
| Database architecture | SQLite with `better-sqlite3`; schema is still created/altered at process startup in `db.js`. |
| Authentication | Email/password with bcrypt hashes and JWT bearer tokens; no refresh/revocation/rate-limit/password-reset flow. |
| Authorization | Role checks exist for owner/branch manager/viewer, but selected branch/restaurant context is not consistently carried from frontend to backend. |
| AI | Backend-only OpenAI Responses API integration when `OPENAI_API_KEY` exists; deterministic built-in assistant otherwise; sanitized AI mode logging exists. |
| Deployment | Dockerfile, Railway config, Render config, and CI exist. Docker/Render use pnpm. Durable storage and backups remain unresolved. |
| Testing | Root `pnpm validate` covers frontend lint, format check, frontend tests, backend tests/evals, typecheck hook, and frontend build. |

## Findings refreshed against `fb1ed18`

| ID | Priority | Status | Area | File/path | Current behavior | Risk | Recommended change | Breaking change? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ER-001 | P0 | OPEN | Backup/recovery readiness | `05-devops-qa/Dockerfile`, `railway.json`, `render.yaml`, `02-backend/server/src/db.js` | Production data is still a SQLite file selected by `DATABASE_PATH`. Render mounts `/var/data`; Docker defaults to `/data`; Railway volume attachment is deployment-operator responsibility. | Real restaurant data can disappear if deployed to ephemeral storage or if a persistent volume is not attached correctly. | Enforce durable production storage, add a deployment-time volume check, document supported storage modes, and plan PostgreSQL for real customers. | Yes if moving to PostgreSQL; no for volume enforcement. |
| ER-002 | P0 | OPEN | Backup/recovery readiness | `docs/operations/README.md`, repository-wide | Operations docs mention backups, but no automated backup script, restore drill, retention policy, or restore test exists. | A corrupt DB file, accidental import, bad deploy, or disk failure can permanently lose customer data. | Add backup automation, restore validation, retention policy, RPO/RTO targets, and a recovery runbook. | No. |
| ER-003 | P1 | OPEN | Database migrations | `02-backend/server/src/db.js` | Tables are created with `CREATE TABLE IF NOT EXISTS`; schema upgrades still happen through `ensureColumn()` at startup. | Irreversible production schema mutation happens during app boot with no migration versioning, rollback plan, or migration lock. | Adopt explicit migration files with version tracking, transactional execution, and pre-deploy migration validation. | Potentially. |
| ER-004 | P1 | OPEN | Multi-tenant isolation | `02-backend/server/src/index.js` (`getAuthContext`, `/api/auth/login`) | If `organizationId`/`restaurantId` are not supplied, the first matching membership/restaurant is selected with `ORDER BY ou.id LIMIT 1`. | A multi-organization user can be placed into the wrong restaurant context. | Require explicit organization/restaurant selection when multiple memberships exist; encode selected context in token/session. | Yes for login UX/API response. |
| ER-005 | P1 | OPEN | Branch isolation | `03-frontend/web/src/contexts/RestaurantContext.jsx`, `03-frontend/web/src/components/legacy/LegacyApplication.jsx`, `02-backend/server/src/index.js` (`toolScope`, dashboard/chat routes) | Frontend stores selected branch, but dashboard/chat/tool scope uses `defaultBranchId(req.user)` rather than the selected branch from the request. | Users may see or analyze a different branch than the UI indicates. | Pass `branchId` on all branch-scoped API calls and validate through one shared server-side scope resolver. | Yes for API contracts. |
| ER-006 | P1 | OPEN | API/database correctness | `02-backend/server/src/dataImport.js` (`dataConnectionStatus`) | When `branchId` exists, `count("menu_items")` generates SQL using `menu_items.branch_id`, but `menu_items` has no `branch_id` column. | `/api/data/status`, dashboard data readiness, and AI readiness can fail in branch-scoped contexts. | Count restaurant-scoped and branch-scoped tables with separate logic. | No. |
| ER-007 | P1 | OPEN | Authorization | `02-backend/server/src/index.js` (`/api/training/export`) | Any authenticated role can export training feedback for the restaurant. | Viewers or branch managers can extract corrected owner answers and operational notes. | Restrict export to owners or an explicit AI/data-admin role; branch-scope exported rows where applicable. | No. |
| ER-008 | P1 | OPEN | Feedback integrity | `02-backend/server/src/index.js` (`/api/feedback`) | Request accepts `correctTools`, but stores `JSON.stringify([])` instead of submitted reviewed tools. | Training/evaluation data is incomplete and cannot verify correct tool selection. | Store validated `correctTools` and server-side tool trace metadata. | No. |
| ER-009 | P1 | OPEN | Knowledge access control | `02-backend/server/src/index.js`, `02-backend/server/src/knowledge.js` | Knowledge search is available to any authenticated user in the restaurant; chunks are restaurant-scoped but not branch- or role-scoped. | Sensitive SOPs/books/recipes can be exposed to roles that should not read them. | Add knowledge permissions, branch scope, document visibility, delete, and audit controls. | Potentially. |
| ER-010 | P1 | OPEN | Authentication | `02-backend/server/src/index.js` (`/api/users/invite`) | Inviting a user returns a plaintext temporary password in the API response. | Passwords can leak through browser history, screenshots, support sessions, or logs. | Replace with one-time invite tokens, expiry, first-login password setup, and email delivery. | Yes for invite flow. |
| ER-011 | P1 | OPEN | Authentication | `02-backend/server/src/index.js`, `03-frontend/web/src/lib/storage.js` | JWTs expire after 12 hours but have no server-side revocation; logout is client-side only; token is stored in `localStorage`. | Stolen tokens remain usable until expiry; XSS can steal JWTs. | Use httpOnly secure cookies or short-lived access tokens plus refresh rotation/revocation; add session table and logout invalidation. | Yes for auth transport. |
| ER-012 | P1 | OPEN | Security | `02-backend/server/src/index.js` | No login throttling, account lockout, IP/device anomaly tracking, or brute-force protection is present. | Credential stuffing and password guessing are practical against public deployments. | Add rate limits to auth endpoints, lockout/backoff, audit logs, and alerting. | No. |
| ER-013 | P1 | OPEN | Error handling/logging | `02-backend/server/src/index.js` (global error handler) | Server logs `console.error(error)` for unhandled errors. | Stack traces, SQL text, file paths, and operational details can leak to platform logs. | Replace with structured sanitized error logging, request IDs, severity levels, and safe error classes. | No. |
| ER-014 | P1 | OPEN | Import safety | `02-backend/server/src/dataImport.js`, `02-backend/server/src/index.js` (`/api/data/import/preview`, `/api/data/import`) | Preview validates CSV, but confirmation re-submits raw CSV; preview is not bound to a server-side import job/hash. | User can preview one file and import a different file; import auditability remains weak. | Create import jobs with file hash, preview rows, rejected rows, confirmation token, and immutable audit record. | Yes for import API. |
| ER-015 | P1 | OPEN | Import safety | `02-backend/server/src/dataImport.js` | Orders/refunds have duplicate protection; staff shifts do not. Menu item upsert is restaurant-wide, not branch/channel-aware. | Repeated staff-shift import can inflate labor costs; menu economics cannot differ by branch/channel. | Add source keys/fingerprints for staff shifts and define menu economics scope. | Potentially. |
| ER-016 | P1 | OPEN | Financial accuracy | `02-backend/server/src/tools.js`, `02-backend/server/src/dataImport.js` | Money uses JavaScript floating point; profit is estimated from available fields and can omit taxes, rent, utilities, wastage, platform fees, or comps. | Financial reports can be misread as accounting-grade profit. | Use integer minor units or decimal library; separate contribution margin from estimated operating profit with coverage metadata. | Potentially for API field names. |
| ER-017 | P1 | OPEN | AI safety/tool grounding | `02-backend/server/src/ai.js`, `02-backend/server/src/tools.js` | OpenAI receives a deterministic tool-backed draft and context; native model tool calls are not used. | Model answer quality depends on preselected logic; traceability between final model text and tool output is limited. | Implement auditable tool trace, allowlisted tool loop or planner, and tool-result citations. | Yes for response metadata. |
| ER-018 | P1 | OPEN | AI privacy | `02-backend/server/src/ai.js` | When OpenAI mode is enabled, restaurant question and tool-backed data are sent to the provider without tenant-level consent/settings. | Customers may not have consented to external AI processing of operational data. | Add tenant AI provider settings, consent, redaction, retention disclosure, and default-off governance. | Potentially. |
| ER-019 | P1 | RESOLVED | Deployment package manager | `05-devops-qa/Dockerfile`, `render.yaml`, `package.json`, `pnpm-lock.yaml` | Docker and Render now use Corepack and pnpm; root `packageManager` is `pnpm@11.17.0`; CI uses `pnpm install --frozen-lockfile`. | Original lockfile-reproducibility risk from npm/pnpm mismatch is addressed for configured build paths. | Keep all future deployment docs and scripts pnpm-only. | No. |
| ER-020 | P1 | RESOLVED | CI/CD foundation | `.github/workflows/validate.yml`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/*` | Active GitHub Actions workflow runs `pnpm validate`; CODEOWNERS and PR/issue templates exist. | Original missing-CI/missing-review-template finding is resolved. | Add future jobs for dependency audit and deployment once production controls are ready. | No. |
| ER-021 | P1 | OPEN | Production scalability | `02-backend/server/src/db.js`, `02-backend/server/src/index.js` | SQLite is used directly from the web process through synchronous `better-sqlite3` calls. | Concurrent users/imports/AI chats can block the event loop; horizontal scaling is unsafe against a single file DB. | Move production persistence to PostgreSQL and isolate expensive imports/reports into jobs. | Yes. |
| ER-022 | P2 | OPEN | Frontend architecture | `03-frontend/web/src/pages/LegacyWorkspacePage.jsx`, `03-frontend/web/src/components/legacy/LegacyApplication.jsx` | New shell/navigation exists, but core product remains in a large legacy component. | State, auth, branch selection, data loading, and UI behavior remain hard to reason about and test. | Split workspace into feature modules and route-level pages using shared API/query hooks. | No if incremental. |
| ER-023 | P2 | OPEN | Frontend state | `03-frontend/web/src/lib/storage.js`, `03-frontend/web/src/contexts/AuthContext.jsx`, `03-frontend/web/src/contexts/RestaurantContext.jsx` | Auth/session/selected restaurant/selected branch are persisted separately in `localStorage`; logout clears auth keys but selected branch keys are separate. | Switching users can leave stale tenant UI context or query cache state. | Clear all tenant-scoped storage on logout/user switch and scope query keys by organization/restaurant/branch. | No. |
| ER-024 | P2 | OPEN | Internationalization | `03-frontend/web/src/app/i18n.js`, `02-backend/server/src/ai.js`, `02-backend/server/src/db.js` | Arabic/Chinese text appears mojibake-encoded in several source files. | UI/AI output can look broken and unprofessional for Arabic/Chinese users. | Normalize files to UTF-8, add encoding checks, and add snapshot tests for Arabic/Chinese labels. | No. |
| ER-025 | P2 | OPEN | API design | `02-backend/server/src/index.js`, `README.md` | REST endpoints are unversioned and documented manually; no OpenAPI contract exists. | Frontend/backend changes can drift; external integrations are hard to build safely. | Add `/api/v1`, OpenAPI schema, typed DTOs, and contract tests. | Yes if versioning paths. |
| ER-026 | P2 | OPEN | Validation | `02-backend/server/src/index.js`, `02-backend/server/src/dataImport.js` | Validation exists through inline Zod schemas and custom CSV validators, but schemas are scattered and not reused by frontend. | Duplicate rules and inconsistent client/server validation are likely as features grow. | Create shared validation modules per resource and map errors to stable problem codes. | No. |
| ER-027 | P2 | OPEN | Error handling | `02-backend/server/src/index.js`, `03-frontend/web/src/lib/api.js` | API errors often return `{ error: "..." }`; frontend wraps them in `ApiError`. There is no standard error code, request ID, or retry hint. | Support/debugging and localization are difficult; clients cannot reliably branch by error cause. | Adopt RFC 7807-style errors or `{ code, message, requestId, details }`. | Potentially. |
| ER-028 | P2 | OPEN | Monitoring/observability | `02-backend/server/src/index.js`, `02-backend/server/src/ai.js` | AI mode events are structured, but there is no request logging, metrics, traces, uptime check config, SLOs, or alerting. | Production incidents are hard to detect and diagnose. | Add request IDs, structured access logs, metrics for latency/errors/imports/AI failures, and platform alerts. | No. |
| ER-029 | P2 | PARTIALLY RESOLVED | Docker/deployment | `05-devops-qa/Dockerfile` | Docker now uses pnpm frozen install and builds with `pnpm build`, but still runs as root, has no Docker healthcheck, and does not prune dev dependencies after build. | Attack surface and runtime health detection are still weaker than production best practice. | Add multi-stage image, non-root user, production dependency pruning, and `HEALTHCHECK`. | No. |
| ER-030 | P2 | PARTIALLY RESOLVED | Secrets/environment variables | `.env.example`, `SECURITY.md`, `docs/security/README.md`, `02-backend/server/src/ai.js`, `02-backend/server/src/index.js` | Secret handling is documented and keys remain backend-only in code; production env validation is still limited and `/api/health` still exposes non-secret model/mode details. | Misconfiguration can still cause broken CORS/unsupported model names; health endpoint reveals deployment details. | Add strict production env schema/allowlist and protect detailed debug output in production. | No. |
| ER-031 | P2 | RESOLVED | Root testing/validation | `package.json`, `02-backend/server/package.json`, `03-frontend/web/package.json` | Root scripts include `test:unit`, `test:integration`, `test`, `build`, `format:check`, `typecheck`, and `validate`. `pnpm validate` runs frontend tests, backend tests/evals, lint, formatting, typecheck hook, and build. | Original risk that root tests missed frontend checks is resolved. | Add real TypeScript checking if/when TS is introduced. | No. |
| ER-032 | P2 | OPEN | Test isolation | `02-backend/server/test/*.test.js` | Backend tests still rely on caller-provided `DATABASE_PATH` and a shared imported database module. | Tests can contaminate each other or local data if run with the wrong environment. | Force test database path setup in test bootstrap and isolate test files/transactions. | No. |
| ER-033 | P2 | OPEN | Code organization | `02-backend/server/src/index.js` | `index.js` still contains app setup, auth helpers, route handlers, validation, user management, imports, chat, feedback, static serving, and error handling. | API surface remains difficult to maintain and secure as features grow. | Split into routers/controllers/services/policies while keeping the monorepo. | No if incremental. |
| ER-034 | P2 | PARTIALLY RESOLVED | Documentation | `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/**`, `05-devops-qa/docs/repository-audit.md` | New enterprise docs exist and README/role docs use pnpm, but `05-devops-qa/docs/repository-audit.md` is still an older historical audit. | Team members may still read older docs as current if not clearly marked historical. | Mark older audit docs as historical or move them under an archive folder. | No. |
| ER-035 | P2 | RESOLVED | Developer experience | `package.json`, `.editorconfig`, `.nvmrc`, `.prettierrc`, `.prettierignore`, `CONTRIBUTING.md`, docs | Required root commands exist; Node/pnpm versions are documented; developer instructions use pnpm. | Original mixed package-manager/developer-command risk is resolved. | Keep future docs pnpm-only. | No. |
| ER-036 | P3 | OPEN | Production scalability | `02-backend/server/src/dataImport.js`, `02-backend/server/src/knowledge.js`, `02-backend/server/src/tools.js` | Imports, knowledge search, reports, and calculations run synchronously in the web request process. | Large datasets will cause latency spikes/timeouts. | Add background job queue, import workers, report workers, and async job status APIs. | Yes for long-running APIs. |
| ER-037 | P3 | OPEN | Database/search scalability | `02-backend/server/src/knowledge.js`, `02-backend/server/src/tools.js` | Knowledge search is linear keyword matching; analytics parse order JSON at read time. | Performance degrades with large documents/orders. | Add full-text/vector search and normalized order item fact tables. | Yes for data model. |
| ER-038 | P3 | PARTIALLY RESOLVED | Dependency management | `package.json`, `.github/workflows/validate.yml`, `pnpm-lock.yaml` | pnpm lockfile and CI validation exist, but no dependency scanning, `pnpm audit`, Dependabot, or Renovate workflow is configured. | Security patches can still be missed. | Add automated dependency updates and SCA/audit checks in CI. | No. |

## Findings resolved by `fb1ed18`

- ER-019: Deployment package-manager mismatch resolved for Docker, Render, CI, and root scripts.
- ER-020: Active GitHub Actions validation, CODEOWNERS, PR template, and issue templates now exist.
- ER-031: Root validation now includes frontend tests, backend tests/evals, formatting, lint, typecheck hook, and build.
- ER-035: Developer experience foundation is standardized on pnpm with Node/pnpm version files and contribution docs.

## Partially resolved by `fb1ed18`

- ER-029: Docker now uses pnpm/frozen lockfile, but still needs non-root runtime, healthcheck, and production-only image hardening.
- ER-030: Security docs and backend-only AI-key usage exist, but strict production env validation/debug gating are still missing.
- ER-034: Current enterprise docs exist, but older historical audit docs remain and should be marked as historical.
- ER-038: pnpm lockfile and CI exist, but dependency scanning and automated updates are still missing.

## Exact P0 findings

1. ER-001: Production SQLite persistence is not guaranteed durable across all deployment modes.
2. ER-002: No automated backup, restore drill, retention policy, or tested recovery process exists.

## Exact next implementation task

Implement P0 data durability and backup/recovery readiness only:

1. Define the supported production storage mode for the MVP.
2. Add a startup/deployment check that refuses unsafe production SQLite paths unless an explicitly documented durable path is configured.
3. Add backup and restore scripts/runbook for the selected storage mode.
4. Add a restore verification command and document RPO/RTO expectations.

Do not start tenant/auth/migration refactors until the P0 data-loss path is closed.

## Validation command

Use the repository merge gate:

```bash
pnpm validate
```
