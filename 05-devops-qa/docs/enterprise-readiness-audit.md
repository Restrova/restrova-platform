# Enterprise readiness audit

Date: 2026-08-09  
Audited commit: `45e1011` (`main`)  
Scope: repository at current HEAD only. This audit intentionally does not rely on `05-devops-qa/docs/repository-audit.md`, because that document is older and may be stale.

No application behavior was changed for this audit.

## Executive summary

The repository is a strong MVP organized into team sections:

- `02-backend/server`: Express API, SQLite persistence, JWT auth, restaurant tools, AI/deterministic assistant runtime.
- `03-frontend/web`: React + Vite app shell, routes, i18n foundations, base UI, legacy workspace.
- `04-data-ai/evals`: deterministic assistant evaluation suite.
- `05-devops-qa`: deployment assets, QA docs, team ownership docs.

The current system is not enterprise-ready for real restaurant customers yet. The largest blockers are durable data/backups, formal migrations, tenant/branch context consistency, authentication/session hardening, import safety, observability, CI/CD enforcement, and SQLite production scalability.

## Severity key

- P0: security or data-loss issue.
- P1: required before real customers.
- P2: production quality improvement.
- P3: future scaling improvement.

## Architecture snapshot

| Area | Current state |
| --- | --- |
| Repository architecture | pnpm workspace with team folders `02-backend`, `03-frontend`, `04-data-ai`, `05-devops-qa`. Some tooling remains root-level, which is correct for package/deployment discovery. |
| Backend architecture | Single Express application in `02-backend/server/src/index.js`; database, AI, import, knowledge and tool logic split into modules. |
| Frontend architecture | React SPA with route shell and reusable UI components, but the main product flow still routes to `LegacyWorkspacePage` / `LegacyApplication`. |
| Database architecture | SQLite with `better-sqlite3`; schema is created and altered at process startup in `db.js`. |
| Authentication | Email/password with bcrypt hashes and JWT bearer tokens; no refresh/revocation/rate limit/password reset flow. |
| Authorization | Role checks exist for owner/branch manager/viewer, but branch/restaurant context is not consistently carried from frontend to backend. |
| AI | Backend-only OpenAI Responses API integration when `OPENAI_API_KEY` exists; deterministic built-in assistant otherwise; sanitized AI mode logging exists. |
| Deployment | Dockerfile, Railway config and Render config exist. Durable storage depends on environment/platform setup. |
| Testing | Backend node tests, frontend Vitest tests, frontend ESLint, frontend build, and AI evals exist. Root scripts do not run every available check. |

## Findings

| ID | Priority | Area | File/path | Current behavior | Risk | Recommended change | Breaking change? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ER-001 | P0 | Backup/recovery readiness | `05-devops-qa/Dockerfile`, `railway.json`, `render.yaml`, `02-backend/server/src/db.js` | Production data is a SQLite file selected by `DATABASE_PATH`. Render config mounts `/var/data`; Railway config references Docker only and does not prove a mounted persistent volume. | Real restaurant data can disappear if deployed to ephemeral storage or if a volume is not attached correctly. | Move production to managed PostgreSQL or enforce a startup durability check plus documented mounted-volume requirement and backups. | Yes if moving to PostgreSQL; no if enforcing volume config. |
| ER-002 | P0 | Backup/recovery readiness | Repository-wide; no backup scripts/docs found under `05-devops-qa/` | No backup schedule, restore drill, retention policy, or point-in-time recovery process is defined. | A corrupt SQLite file, accidental import, bad deploy, or platform disk failure can permanently lose customer data. | Add automated backups, restore validation, retention policy, and recovery runbook before onboarding real restaurants. | No. |
| ER-003 | P1 | Database migrations | `02-backend/server/src/db.js` | Tables are created with `CREATE TABLE IF NOT EXISTS`; schema upgrades happen through `ensureColumn()` at startup. | Irreversible production schema mutation happens during app boot with no version history, rollback plan, or migration lock. | Adopt explicit migration files with version tracking, transactional migrations, rollback/forward-only policy, and pre-deploy migration checks. | Potentially, depending on migration framework. |
| ER-004 | P1 | Multi-tenant isolation | `02-backend/server/src/index.js` (`getAuthContext`, `/api/auth/login`) | If `organizationId`/`restaurantId` are not supplied, the first matching membership/restaurant is selected with `ORDER BY ou.id LIMIT 1`. | A multi-organization user can be placed into the wrong restaurant context. | Require explicit organization/restaurant selection after login when multiple memberships exist; encode selected context in token. | Yes for login UX/API response. |
| ER-005 | P1 | Branch isolation | `03-frontend/web/src/contexts/RestaurantContext.jsx`, `03-frontend/web/src/components/legacy/LegacyApplication.jsx`, `02-backend/server/src/index.js` (`toolScope`, dashboard/chat routes) | Frontend stores selected branch, but dashboard/chat/tool scope uses `defaultBranchId(req.user)` rather than the selected branch from the request. | Users may see or analyze a different branch than the UI indicates. | Pass `branchId` on all branch-scoped API calls and validate it server-side through one shared scope resolver. | Yes for API query/body contracts. |
| ER-006 | P1 | API/database correctness | `02-backend/server/src/dataImport.js` (`dataConnectionStatus`) | When a `branchId` exists, `count("menu_items")` generates SQL using `menu_items.branch_id`, but `menu_items` has no `branch_id` column. | `/api/data/status`, dashboard data readiness, and AI data readiness can fail for branch-scoped users. | Count restaurant-scoped tables separately from branch-scoped tables. | No. |
| ER-007 | P1 | Authorization | `02-backend/server/src/index.js` (`/api/training/export`) | Any authenticated role can export training feedback for the restaurant. | Viewers or branch managers can extract corrected owner answers and operational notes. | Restrict export to owners or explicit AI/data-admin role; branch-scope exported rows when applicable. | No. |
| ER-008 | P1 | Feedback integrity | `02-backend/server/src/index.js` (`/api/feedback`) | Request accepts `correctTools`, but stores `JSON.stringify([])` instead of the submitted reviewed tools. | Training/evaluation data becomes incomplete and cannot verify correct tool selection. | Store validated `correctTools` and include server-side tool trace metadata. | No. |
| ER-009 | P1 | Knowledge access control | `02-backend/server/src/index.js`, `02-backend/server/src/knowledge.js` | Knowledge search is available to any authenticated user in the restaurant; chunks are restaurant-scoped but not branch- or role-scoped. | Sensitive SOPs/books/recipes can be exposed to roles that should not read them. | Add knowledge permissions, branch scope, document visibility, and document deletion/audit controls. | Potentially for knowledge API shape. |
| ER-010 | P1 | Authentication | `02-backend/server/src/index.js` (`/api/users/invite`) | Inviting a user returns a plaintext temporary password in the API response. | Password can leak through browser history, screenshots, support sessions, or logs. | Replace with one-time invite tokens, expiry, first-login password setup, and email delivery. | Yes for invite flow. |
| ER-011 | P1 | Authentication | `02-backend/server/src/index.js`, `03-frontend/web/src/lib/storage.js` | JWTs expire after 12 hours but have no server-side revocation; logout is client-side only; token is stored in `localStorage`. | Stolen tokens remain usable until expiry; XSS can steal JWTs. | Use httpOnly secure cookies or short-lived access tokens plus refresh rotation/revocation; add session table and logout invalidation. | Yes for auth transport. |
| ER-012 | P1 | Security | `02-backend/server/src/index.js` | No login throttling, account lockout, IP/device anomaly tracking, or brute-force protection is present. | Credential stuffing and password guessing are practical against public deployments. | Add rate limits to auth endpoints, lockout/backoff, audit logs, and alerting. | No. |
| ER-013 | P1 | Error handling/logging | `02-backend/server/src/index.js` (global error handler) | Server logs `console.error(error)` for all unhandled errors. | Stack traces, SQL text, file paths, and operational details can leak to platform logs. | Replace with structured sanitized error logging, request IDs, severity levels, and safe error classes. | No. |
| ER-014 | P1 | Import safety | `02-backend/server/src/dataImport.js`, `02-backend/server/src/index.js` (`/api/data/import/preview`, `/api/data/import`) | Preview validates the CSV, but confirmation re-submits raw CSV; preview is not bound to a server-side import job/hash. | User can preview one file and import a different file; there is limited auditability. | Create import jobs with file hash, preview rows, rejected rows, explicit confirmation token, and immutable import audit record. | Yes for import API. |
| ER-015 | P1 | Import safety | `02-backend/server/src/dataImport.js` | Orders/refunds have duplicate protection; staff shifts do not. Menu item upsert is restaurant-wide, not branch/channel-aware. | Repeated staff-shift import can inflate labor costs; menu economics cannot differ by branch. | Add source keys/fingerprints for staff shifts and decide whether menu pricing/cost is restaurant-, branch-, or channel-scoped. | Potentially if menu scope changes. |
| ER-016 | P1 | Financial accuracy | `02-backend/server/src/tools.js`, `02-backend/server/src/dataImport.js` | Money uses JavaScript floating point; profit is estimated from available fields and may omit taxes, rent, utilities, wastage, platform fees, or unpaid comps. | Financial reports can be misread as accounting-grade profit. | Use integer minor units or decimal library; rename outputs consistently as contribution/estimated operating profit with coverage metadata. | Potentially for API field names. |
| ER-017 | P1 | AI safety/tool grounding | `02-backend/server/src/ai.js`, `02-backend/server/src/tools.js` | OpenAI receives a deterministic tool-backed draft and context; tools are not exposed as native tool calls in the model request. | Model answer quality depends on preselected logic; traceability between model reasoning and tool output is limited. | Implement structured tool-call loop or explicit server-side planner with auditable tool trace, allowlisted tools, and tool-result citations. | Yes for AI response metadata. |
| ER-018 | P1 | AI privacy | `02-backend/server/src/ai.js` | When OpenAI mode is enabled, restaurant question and tool-backed data are sent to the provider without a tenant-level data-sharing setting. | Customers may not have consented to external AI processing of operational data. | Add tenant AI provider settings, consent, redaction, retention mode documentation, and clear data-processing disclosure. | No for default-off; yes if requiring tenant configuration. |
| ER-019 | P1 | Deployment | `05-devops-qa/Dockerfile`, `package.json`, `pnpm-lock.yaml` | Repository is pnpm-based and should use Corepack plus `pnpm install --frozen-lockfile` in every production build. | Production dependency tree can differ from tested local dependency tree if any deployment bypasses pnpm. | Keep Docker, Render, Railway and CI on pnpm frozen installs only. | No. |
| ER-020 | P1 | CI/CD | `.github/`, `05-devops-qa/github-templates/CODEOWNERS.example` | No active `.github/workflows` CI files are present; CODEOWNERS exists only as an example template. | Pull requests can merge without automated lint/test/build gates or owner review enforcement. | Add GitHub Actions for install, lint, frontend tests, backend tests/evals, build, security audit, and activate CODEOWNERS. | No. |
| ER-021 | P1 | Production scalability | `02-backend/server/src/db.js`, `02-backend/server/src/index.js` | SQLite is used directly from the web process through synchronous `better-sqlite3` calls. | Concurrent users/imports/AI chats can block the event loop; horizontal scaling is unsafe against a single file DB. | Move production persistence to PostgreSQL and isolate expensive imports/reports into jobs. | Yes. |
| ER-022 | P2 | Frontend architecture | `03-frontend/web/src/pages/LegacyWorkspacePage.jsx`, `03-frontend/web/src/components/legacy/LegacyApplication.jsx` | New shell/navigation routes exist, but core product remains in a large legacy component. | State, auth, branch selection, data loading, and UI behavior are hard to reason about and test. | Split workspace into feature modules and route-level pages using shared API/query hooks. | No if incremental. |
| ER-023 | P2 | Frontend state | `03-frontend/web/src/lib/storage.js`, `03-frontend/web/src/contexts/AuthContext.jsx`, `03-frontend/web/src/contexts/RestaurantContext.jsx` | Auth/session/selected restaurant/selected branch are persisted separately in `localStorage`; logout clears auth keys but selected branch keys are separate. | Switching users can leave stale UI context or query cache state. | Clear all tenant-scoped storage on logout/user switch and scope query keys by organization/restaurant/branch. | No. |
| ER-024 | P2 | Internationalization | `03-frontend/web/src/app/i18n.js`, `02-backend/server/src/ai.js`, `02-backend/server/src/db.js` | Arabic/Chinese text appears mojibake-encoded in several source files. | UI/AI output can look broken and unprofessional for Arabic/Chinese users. | Normalize source files to UTF-8, add encoding checks, and add snapshot tests for Arabic/Chinese labels. | No. |
| ER-025 | P2 | API design | `02-backend/server/src/index.js`, `README.md` | REST endpoints are unversioned and documented manually; no OpenAPI contract exists. | Frontend/backend changes can drift; external integrations are hard to build safely. | Add `/api/v1`, OpenAPI schema, typed request/response DTOs, and contract tests. | Yes if versioning paths. |
| ER-026 | P2 | Validation | `02-backend/server/src/index.js`, `02-backend/server/src/dataImport.js` | Validation exists through inline Zod schemas and custom CSV validators, but schemas are not centralized or reused by frontend. | Duplicate rules and inconsistent client/server validation are likely as features grow. | Create shared validation modules per resource and map errors to stable problem codes. | No. |
| ER-027 | P2 | Error handling | `02-backend/server/src/index.js`, `03-frontend/web/src/lib/api.js` | API errors often return `{ error: "..." }`; frontend wraps them in `ApiError`. There is no standard error code, request ID, or retry hint. | Support/debugging and localization are difficult; clients cannot reliably branch by error cause. | Adopt RFC 7807-style errors or `{ code, message, requestId, details }`. | Potentially for API clients. |
| ER-028 | P2 | Monitoring/observability | `02-backend/server/src/index.js`, `02-backend/server/src/ai.js` | AI mode events are structured, but there is no request logging, metrics, traces, uptime check config, SLOs, or alerting. | Production incidents are hard to detect and diagnose. | Add request IDs, structured access logs, metrics for latency/errors/imports/AI failures, and platform alerts. | No. |
| ER-029 | P2 | Docker/deployment | `05-devops-qa/Dockerfile` | Container runs as root, has no Docker healthcheck, and does not prune dev dependencies after build. | Larger attack surface and less reliable runtime health detection. | Use multi-stage build, non-root user, frozen lockfile install, production dependencies only, and `HEALTHCHECK`. | No. |
| ER-030 | P2 | Secrets/environment variables | `.env.example`, `02-backend/server/src/ai.js`, `02-backend/server/src/index.js` | Required vars are partially documented; `CLIENT_ORIGIN` defaults to localhost; `OPENAI_MODEL` defaults to `gpt-5.6`; `/api/health` exposes non-secret model/mode in production. | Misconfigured deployments can have broken CORS or unsupported model names; health endpoint reveals deployment details. | Add production env validation with explicit allowed values and protect/debug-gate detailed AI health output. | No. |
| ER-031 | P2 | Testing | `package.json`, `03-frontend/web/package.json`, `02-backend/server/package.json` | Root `test` runs backend tests/evals only; root `lint` runs frontend lint only; there is no root frontend test script or typecheck. | Teams can think all tests passed while frontend unit tests were not run. | Add root `test:frontend`, `test:backend`, `test:all`, `build:all`, and CI matrix. | No. |
| ER-032 | P2 | Testing | `02-backend/server/test/*.test.js` | Backend tests share the imported database module and rely on `DATABASE_PATH` setup by the caller. | Tests can contaminate each other or local data if run with the wrong environment. | Force test database path creation in test setup and isolate each test file or transaction. | No. |
| ER-033 | P2 | Code organization | `02-backend/server/src/index.js` | `index.js` contains app setup, auth helpers, route handlers, validation, user management, imports, chat, feedback, static serving, and error handling. | The API surface becomes difficult to maintain and secure as features grow. | Split into routers/controllers/services/policies and keep `index.js` as composition only. | No if incremental. |
| ER-034 | P2 | Documentation | `README.md`, `05-devops-qa/docs/repository-audit.md` | Some docs describe current behavior, but older audit content is stale and contains outdated missing-feature statements. | Team members may implement against stale assumptions. | Keep current audit docs versioned, add architecture decision records, and archive stale docs clearly. | No. |
| ER-035 | P2 | Developer experience | `package.json`, `pnpm-workspace.yaml`, `05-devops-qa/Dockerfile` | The workspace is pnpm-configured and should expose all required root commands through pnpm. | New team members can install different dependency graphs or run different scripts if docs drift. | Keep all developer, CI and deployment instructions pnpm-only and document exact Node/package-manager versions. | No. |
| ER-036 | P3 | Production scalability | `02-backend/server/src/dataImport.js`, `02-backend/server/src/knowledge.js`, `02-backend/server/src/tools.js` | Imports, knowledge search, reports, and calculations run synchronously in the web request process. | Large customer datasets will cause latency spikes/timeouts. | Add background job queue, import workers, report workers, and async job status APIs. | Yes for long-running APIs. |
| ER-037 | P3 | Database/search scalability | `02-backend/server/src/knowledge.js`, `02-backend/server/src/tools.js` | Knowledge search is linear keyword matching; analytics parse order JSON at read time. | Performance degrades with large documents/orders. | Add full-text/vector search for knowledge and normalized order item fact tables for analytics. | Yes for data model. |
| ER-038 | P3 | Dependency management | `package.json`, `02-backend/server/package.json`, `03-frontend/web/package.json` | Dependencies are pinned by lockfile, but there is no automated vulnerability/dependency update workflow. | Security patches can be missed. | Add Dependabot/Renovate and `pnpm audit`/SCA in CI. | No. |

## Requested audit areas coverage

1. Repository architecture: organized by team section, but scripts/docs still need standardization.
2. Backend architecture: functional MVP, but `index.js` is too broad for enterprise maintenance.
3. Frontend architecture: shell is in place, but core workspace remains legacy.
4. Database architecture: SQLite startup schema mutation is not enterprise-safe.
5. Authentication and authorization: basic JWT/RBAC exists; session and invite hardening needed.
6. Multi-tenant isolation: org/restaurant/branch tables exist; selected context is inconsistent.
7. API design: simple REST; no versioning or OpenAPI.
8. Validation: Zod and CSV validation exist; schemas are scattered.
9. Error handling: generic responses exist; no standard error contract.
10. Logging: AI logs are sanitized; general error logging is not structured/sanitized.
11. Security: several basics exist (`helmet`, JWT secret required in production), but rate limits, session revocation and secret hygiene processes are missing.
12. Secrets/environment variables: keys are backend-only in code; env validation and production debug gating need improvement.
13. Testing: good MVP tests/evals exist; CI and root coverage are incomplete.
14. AI safety/tool grounding: deterministic grounding exists; OpenAI tool trace/consent/redaction need maturity.
15. CI/CD: no active GitHub Actions workflow at HEAD.
16. Docker/deployment: Docker exists but should be pnpm-frozen, non-root, healthchecked, and tied to durable storage.
17. Database migrations: no formal migration system.
18. Monitoring/observability: minimal.
19. Dependency management: lockfile exists; no automated security updates.
20. Code organization: team folders exist; backend and legacy frontend need modularization.
21. Documentation: helpful but some docs are stale.
22. Developer experience: pnpm-only instructions and one-command validation must stay current as the repo evolves.
23. Production scalability: SQLite/synchronous request processing limits scaling.
24. Backup/recovery readiness: not ready.

## Test command plan

The following checks should be run after this documentation-only change:

```bash
pnpm lint
pnpm --filter web test
pnpm test
pnpm build
```

If the local sandbox blocks Vite/esbuild filesystem reads, rerun `pnpm build` in the normal shell environment.
