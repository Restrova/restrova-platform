# Enterprise readiness roadmap

Date: 2026-08-09  
Basis: `05-devops-qa/docs/enterprise-readiness-audit.md` at current HEAD.

This roadmap preserves the team-section structure:

- Backend developer: `02-backend/`
- Frontend developer: `03-frontend/`
- Data/AI engineer: `04-data-ai/` plus AI/tool modules in backend
- DevOps/QA engineer: `05-devops-qa/` and root deployment/tooling files

## Phase 0: stop data-loss and unsafe-production risks

Goal: make it safe to test with real pilot data without silent data loss.

| Workstream | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| Durable database | Backend + DevOps/QA | Decide PostgreSQL vs durable SQLite volume; document supported production mode; enforce startup durability checks. | A fresh deployment cannot start in unsafe production storage mode. |
| Backups and restore | DevOps/QA | Backup schedule, retention policy, restore runbook, restore drill script. | A backup can be restored into a staging environment and verified. |
| Migration system | Backend | Versioned migration framework replacing ad-hoc `ensureColumn()` changes. | Schema changes are reviewed, repeatable, and tracked by migration version. |
| Secret exposure response | DevOps/QA | Rotate any key that was ever pasted into screenshots or chat; document secret rotation steps. | No exposed key remains active. |

Recommended order:

1. Rotate any exposed OpenAI/API credentials.
2. Define production database target.
3. Add backup/restore process.
4. Add formal migrations before the next schema change.

## Phase 1: real-customer access control

Goal: make organization, restaurant, branch and role boundaries reliable.

| Workstream | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| Explicit tenant selection | Backend + Frontend | Login returns available memberships when multiple exist; user selects organization/restaurant explicitly. | A multi-organization user cannot be silently placed in the wrong restaurant. |
| Branch-scoped API contract | Backend + Frontend | Every branch-aware endpoint accepts and validates selected `branchId`; frontend query keys include org/restaurant/branch. | Switching branch in UI changes the data scope everywhere. |
| Role hardening | Backend | Owner-only training export; knowledge permissions; branch-manager scoped reads/writes. | Viewers cannot export training data or read restricted knowledge. |
| Session hardening | Backend + Frontend | Server-side sessions or refresh-token rotation, logout revocation, auth rate limits. | Logout invalidates server-side access and brute-force attempts are throttled. |
| Invite flow | Backend + Frontend | One-time invite token with expiry and first-login password setup. | Temporary plaintext passwords are no longer returned by API. |

## Phase 2: enterprise-safe data ingestion and financial engine

Goal: make restaurant data imports auditable and financial answers defensible.

| Workstream | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| Import jobs | Backend + Frontend | Server-side import job, file hash, preview, rejected rows, confirmation token, duplicate report. | User confirms the exact previewed dataset before live writes. |
| Duplicate safety | Backend | Source keys/fingerprints for staff shifts and other mutable import types. | Re-importing the same file does not double count labor or sales. |
| Money model | Backend | Decimal/minor-unit calculations; contribution margin and estimated operating profit separated. | Reports disclose calculation coverage and avoid misleading labels. |
| Data quality model | Backend + Data/AI | Missing data coverage scores by branch and report period. | AI answers name missing data precisely before giving financial conclusions. |

## Phase 3: AI governance and answer quality

Goal: make AI answers auditable, grounded and acceptable for business operators.

| Workstream | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| Tool trace | Data/AI + Backend | Structured tool planner/caller, persisted tool trace, model response metadata. | Every numeric AI answer can be traced to exact tool output. |
| Provider controls | Data/AI + Backend | Tenant-level OpenAI enable/disable, redaction policy, model allowlist, provider disclosure. | A customer can decide whether external AI processing is allowed. |
| Action approval | Backend + Frontend | Pending actions include exact item, branch, user, expiry, preview diff and approval UI. | AI cannot execute or imply changes without exact owner confirmation. |
| Evaluation lifecycle | Data/AI + QA | Versioned eval dataset, regression thresholds, Arabic/English quality tests in CI. | Prompt/tool changes cannot merge if eval quality drops. |
| Knowledge governance | Data/AI + Backend | Document visibility, delete, re-index, branch scope, source citations. | Knowledge answers cite approved sources and respect role/branch access. |

## Phase 4: observability, CI/CD and release readiness

Goal: make changes safely deployable by a team.

| Workstream | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| CI pipeline | DevOps/QA | GitHub Actions for install, lint, frontend tests, backend tests/evals, build, audit. | PRs cannot merge without green checks. |
| CODEOWNERS | DevOps/QA + Leads | Activate `.github/CODEOWNERS` from the template. | Backend/frontend/data/devops owners review their sections. |
| Docker hardening | DevOps/QA | pnpm frozen install, multi-stage image, non-root runtime, healthcheck. | Production image is reproducible and healthchecked. |
| Observability | Backend + DevOps/QA | Request IDs, structured logs, metrics, uptime checks, alerts. | Operators can identify error rate, latency, AI failures and import failures. |
| Release process | DevOps/QA | Staging environment, deployment checklist, rollback plan. | Every production deploy has a verified staging build and rollback path. |

## Phase 5: scale and maintainability

Goal: support larger restaurants, more branches and heavier data.

| Workstream | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| PostgreSQL analytics model | Backend | Normalized order item fact tables, indexed branch/date/channel dimensions. | Menu/profit reports do not parse JSON order items at read time. |
| Background jobs | Backend + DevOps/QA | Queue for imports, reports, knowledge indexing and heavy analytics. | Large imports no longer block web requests. |
| Search upgrade | Data/AI | Full-text or vector retrieval with permissions and citations. | Knowledge search remains fast and relevant at large document volume. |
| Frontend feature modularization | Frontend | Replace legacy workspace with route-level feature modules and shared query hooks. | Dashboard/imports/assistant/report pages can be owned independently. |
| API contracts | Backend + Frontend | OpenAPI, generated clients/types, contract tests. | Frontend and backend changes are contract-checked. |

## Suggested milestone sequence

1. P0 data safety: storage, backups, restore, secret rotation.
2. P1 tenant/branch/auth: explicit context, branch-scoped APIs, roles, sessions, invites.
3. P1 import/finance correctness: import jobs, duplicate protection, decimal money.
4. P1/P2 AI governance: tool traces, consent, redaction, eval CI.
5. P2 platform readiness: CI, observability, Docker hardening, release workflow.
6. P3 scale: PostgreSQL analytics, queues, search, API contracts.

## Definition of enterprise-ready beta

The product can be considered ready for a small real-customer beta when:

- Production data is durable and restorable.
- Migrations are versioned and tested.
- Multi-tenant and branch isolation pass automated tests.
- Invite/session/auth flows are hardened.
- Imports are previewed, confirmed, deduplicated and audited.
- AI answers include tool traces for numbers and never hide provider failures.
- CI blocks unsafe merges.
- A staging deploy and rollback plan exist.
- Operational logs/metrics can identify production incidents.
