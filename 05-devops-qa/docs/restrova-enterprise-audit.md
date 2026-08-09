# Restrova Enterprise Audit

Date: 2026-08-09
Repository audited: `sami124-coder/AI-ssss` at current HEAD
Target organization: `Restrova`
Target repository name: `restrova-platform`

This audit reflects the actual repository after the modular backend, security hardening, CI, and monorepo foundation work. It does not claim the product is production-ready for real customers.

## Severity scale

- P0: critical security/data-loss issue
- P1: required before production customers
- P2: important production-quality improvement
- P3: future scaling improvement

## Executive summary

Restrova Platform is now organized like an early professional SaaS monorepo:

- pnpm is standardized.
- CI exists and runs mandatory quality gates.
- Backend is modularized into routes, controllers, services, repositories, validation, middleware, config, errors, and observability.
- Security hardening exists for headers, CORS, request limits, JWT validation, role checks, tenant isolation tests, branch isolation tests, and sanitized errors.
- AI behavior is covered by deterministic evaluations.
- Team folders and CODEOWNERS exist.

Main remaining blockers before real customers:

- durable production database/backup/restore
- explicit database migrations
- one-time invite/password reset flow
- token revocation/session hardening
- PostgreSQL migration plan execution
- richer observability/monitoring outside process logs
- branch-selected API contracts across all frontend flows

## Findings

| ID      | Priority | Area                 | Current behavior                                                                                                 | Risk                                                                   | Recommended change                                                                                | Breaking change?                            |
| ------- | -------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ROV-001 | P0       | Backup/recovery      | SQLite file persistence depends on deployment storage configuration.                                             | Real restaurant data can be lost if storage is ephemeral or corrupted. | Add automated backups, restore drills, retention policy, and durable storage checks.              | No for backups; yes for PostgreSQL cutover. |
| ROV-002 | P1       | Database migrations  | Schema is still initialized/altered in `02-backend/server/src/db.js`.                                            | Production schema changes are not versioned or reversible.             | Implement migration runner and versioned SQL migrations in `02-backend/server/db/migrations`.     | Potentially.                                |
| ROV-003 | P1       | Authentication       | Invites return temporary passwords in API response.                                                              | Password leakage through screenshots/logs/support sessions.            | Replace with one-time invite tokens and first-login setup.                                        | Yes.                                        |
| ROV-004 | P1       | Authentication       | JWT logout is client-side; no token revocation/session table.                                                    | Stolen tokens work until expiry.                                       | Add server-side sessions, token revocation, and secure cookie or refresh-token rotation strategy. | Yes.                                        |
| ROV-005 | P1       | Multi-tenant context | Multi-org login can still select a default context when explicit org/restaurant is not provided.                 | User may land in the wrong tenant context.                             | Require explicit tenant selection when multiple memberships exist.                                | Yes for UX/API.                             |
| ROV-006 | P1       | Branch context       | Backend defaults branch scope; frontend selected branch is not yet consistently sent to every branch-scoped API. | User can see analysis for a different branch than selected in UI.      | Add branchId to dashboard/chat/data APIs and enforce one scope resolver.                          | Yes for API contract.                       |
| ROV-007 | P1       | Authorization        | Training export is authenticated but not owner-only.                                                             | Non-owner roles can export training feedback.                          | Restrict to owner or AI/data-admin role.                                                          | No.                                         |
| ROV-008 | P1       | AI privacy           | OpenAI mode can send restaurant data to provider when key is configured.                                         | Tenant data processing may occur without explicit tenant consent.      | Add tenant AI settings, provider consent, redaction, and retention disclosure.                    | Potentially.                                |
| ROV-009 | P1       | Financial accuracy   | Money uses floating point and estimated profit labels.                                                           | Reports may be mistaken for accounting-grade profit.                   | Use integer minor units/decimal math and explicit coverage metadata.                              | Potentially.                                |
| ROV-010 | P1       | Import integrity     | Import confirmation re-submits CSV rather than confirming a server-side preview job.                             | User can preview one file and import another.                          | Add import jobs with preview hash, audit log, and confirmation token.                             | Yes for import API.                         |
| ROV-011 | P1       | Observability        | Structured request logs exist, but no external log pipeline, metrics, alerts, or dashboards.                     | Production incidents may be detected late.                             | Add hosted monitoring, alerting, request/error dashboards, and log retention.                     | No.                                         |
| ROV-012 | P2       | Frontend             | Product shell exists, but core workspace remains a large legacy component.                                       | UI behavior is harder to test and evolve.                              | Continue feature-by-feature extraction into pages/hooks/components.                               | No if incremental.                          |
| ROV-013 | P2       | Internationalization | Some Arabic/Chinese source text appears mojibake-encoded.                                                        | Unprofessional localized experience.                                   | Normalize files to UTF-8 and add locale snapshot tests.                                           | No.                                         |
| ROV-014 | P2       | API design           | REST API is unversioned and manually documented.                                                                 | Contracts can drift.                                                   | Add OpenAPI and consider `/api/v1`.                                                               | Yes if path versioning.                     |
| ROV-015 | P2       | Dependency security  | Dependabot exists; no dedicated vulnerability-audit CI job yet.                                                  | Vulnerable dependencies may be noticed later than desired.             | Add `pnpm audit` policy or dependency review workflow.                                            | No.                                         |
| ROV-016 | P3       | Scalability          | Synchronous SQLite calls run in the web process.                                                                 | Event-loop blocking under larger imports/concurrency.                  | Move heavy imports/reports to jobs and use PostgreSQL for production.                             | Yes for persistence.                        |

## Current strengths

- Repository is a pnpm monorepo with clear team folders.
- CI uses frozen lockfile install and separates frontend, backend, AI evals, and build checks.
- Backend has central config, error model, security middleware, and repository/service layers.
- Security tests prove core access-control boundaries.
- AI evals cover Arabic/English operations behavior and safety regressions.

## Recommended next production tasks

1. Implement explicit database migrations and backup/restore automation.
2. Replace temporary-password invite flow with one-time invite tokens.
3. Add branchId-aware API contracts across dashboard/chat/import flows.
4. Restrict training export to owner/admin roles.
5. Add organization-level AI provider consent/settings.
