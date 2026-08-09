# 02 — Backend / مطور Backend

This section is owned by the backend developer.

## Main code

- [`server/`](server/) — Express API, authentication, database access, restaurant tools, and production server runtime.

## Responsibilities

- API routes and validation.
- JWT/session handling.
- Organization, restaurant, branch, and role isolation.
- SQLite/PostgreSQL persistence.
- Restaurant tool implementations.
- Secure server-only model integration.

## Run backend validation

From the repository root:

```bash
pnpm --filter server test
pnpm --filter server eval
```
