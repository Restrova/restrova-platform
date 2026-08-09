# Enterprise readiness roadmap

Date: 2026-08-09  
Basis: refreshed `05-devops-qa/docs/enterprise-readiness-audit.md` at commit `fb1ed18`.

This roadmap contains only unresolved or partially resolved findings after the repository foundation work. It intentionally does not include resolved foundation items ER-019, ER-020, ER-031, and ER-035.

Do not reorganize the repository and do not introduce microservices. Keep the current monorepo.

## Phase 1: P0 data-loss/security blockers

Goal: make it safe to store real pilot restaurant data.

| Finding | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| ER-001 | Backend + DevOps/QA | Supported production storage mode; durable SQLite volume enforcement or PostgreSQL plan; production startup/deployment safety check. | Production cannot run with an unsafe ephemeral database path. |
| ER-002 | DevOps/QA | Backup script/process, restore script/process, retention policy, RPO/RTO, restore verification command. | A backup can be restored into a clean environment and verified. |

Recommended next commit: P0 database durability plus backup/recovery only.

## Phase 2: P1 tenant/auth/database correctness

Goal: stop incorrect tenant/branch/user context and high-risk auth/data correctness gaps.

| Finding | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| ER-003 | Backend | Formal database migration framework and migration version table. | Schema changes no longer run as unversioned boot-time mutations. |
| ER-004 | Backend + Frontend | Explicit organization/restaurant selection for multi-membership users. | Login cannot silently select the wrong restaurant. |
| ER-005 | Backend + Frontend | Branch-aware request contract and shared server-side scope resolver. | Selected frontend branch matches backend tool/dashboard/chat scope. |
| ER-006 | Backend | Correct restaurant-scoped vs branch-scoped data-status counting. | `/api/data/status` cannot query nonexistent `menu_items.branch_id`. |
| ER-007 | Backend | Owner-only or AI-admin-only training export. | Viewers/branch managers cannot export training feedback. |
| ER-008 | Backend + Data/AI | Persist validated `correctTools` and server-side tool trace metadata. | Feedback exports include accurate reviewed tool labels. |
| ER-009 | Backend + Data/AI | Knowledge document visibility, role/branch scope, deletion and audit. | Restricted knowledge is not exposed to unauthorized users. |
| ER-010 | Backend + Frontend | One-time invitation tokens and first-login password setup. | Invite API no longer returns plaintext temporary passwords. |
| ER-011 | Backend + Frontend | Revocable sessions or secure refresh-token flow; logout invalidation; safer token storage. | Stolen/logged-out sessions can be invalidated server-side. |
| ER-012 | Backend | Auth rate limits, lockout/backoff, security audit logs. | Brute-force attempts are throttled and observable. |
| ER-016 | Backend | Decimal/minor-unit money model and financial coverage labels. | Financial answers cannot be confused with accounting-grade profit. |

## Phase 3: P1 production reliability

Goal: make production operations auditable and safer before real customers.

| Finding | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| ER-013 | Backend + DevOps/QA | Structured sanitized error logging with request IDs. | Logs no longer emit raw unhandled error objects. |
| ER-014 | Backend + Frontend | Server-side import jobs, file hash, preview token, rejected rows, immutable audit record. | User confirms the exact previewed data before live writes. |
| ER-015 | Backend | Duplicate protection for staff shifts and clearly defined menu economics scope. | Re-importing files cannot inflate labor; menu scope is explicit. |
| ER-017 | Backend + Data/AI | Auditable AI tool trace and tool-result citations. | Numeric AI answers can be traced to exact tool output. |
| ER-018 | Backend + Data/AI + Security | Tenant-level AI consent/settings, redaction policy, provider disclosure. | External AI processing is explicitly governed per tenant. |
| ER-021 | Backend + DevOps/QA | PostgreSQL migration plan or production scaling guardrails; import/report work separated from request path. | Production database strategy can support customer concurrency safely. |

## Phase 4: P2 maintainability/observability

Goal: improve maintainability, supportability, and production diagnosis.

| Finding | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| ER-022 | Frontend | Split legacy workspace into feature modules and route-level pages. | Core frontend behavior is testable by feature area. |
| ER-023 | Frontend | Tenant-scoped storage cleanup and query keys. | Logging out or switching users cannot show stale tenant state. |
| ER-024 | Frontend + Data/AI | UTF-8 normalization and Arabic/Chinese encoding tests. | Arabic/Chinese labels and assistant text render correctly. |
| ER-025 | Backend + Frontend | API versioning, OpenAPI, typed DTOs, contract tests. | Frontend/backend API changes are contract-checked. |
| ER-026 | Backend + Frontend | Centralized validation schemas and stable problem codes. | Client/server validation rules stay aligned. |
| ER-027 | Backend + Frontend | Standard API error contract with `code`, `message`, `requestId`, and details. | Clients can handle errors reliably. |
| ER-028 | Backend + DevOps/QA | Request logs, metrics, traces, uptime checks, SLOs and alerts. | Production incidents are visible and diagnosable. |
| ER-029 | DevOps/QA | Multi-stage Docker build, non-root runtime, production dependency pruning, healthcheck. | Container image meets baseline production hardening. |
| ER-030 | Backend + DevOps/QA | Production env schema/allowlist and protected debug output. | Misconfiguration fails fast without leaking deployment detail. |
| ER-032 | Backend + QA | Test bootstrap creates isolated DB path and cleans state. | Tests cannot accidentally use local/product data. |
| ER-033 | Backend | Split `index.js` into routers/controllers/services/policies. | API code is modular without changing monorepo shape. |
| ER-034 | DevOps/QA | Mark stale historical docs or move them to archive. | Team members can distinguish current guidance from historical audit docs. |
| ER-038 | DevOps/QA | Dependency scanning and automated update workflow. | Dependency vulnerabilities are surfaced automatically. |

## Phase 5: P3 scalability

Goal: prepare for larger restaurants, more branches, and heavier data.

| Finding | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| ER-036 | Backend + DevOps/QA | Background jobs for imports, reports, knowledge indexing, and heavy analytics. | Large work no longer blocks web requests. |
| ER-037 | Backend + Data/AI | Full-text/vector search and normalized order-item fact tables. | Knowledge and analytics remain fast at larger data volume. |

## Current validation gate

Every merge should pass:

```bash
pnpm validate
```

Current gate includes:

- Frontend lint.
- Prettier format check.
- Workspace typecheck hook.
- Frontend tests.
- Backend tests.
- AI evaluation dataset.
- Frontend production build.
