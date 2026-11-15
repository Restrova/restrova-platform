# Cloud development environment

The setup script prepares the existing checkout at `/workspace/restrova-platform`
with Node.js 22.23.5 and the repository-pinned pnpm 11.17.0. It verifies the Node
archive checksum and installs dependencies with the frozen lockfile. Tools and
writable caches live under `/workspace/.tools`.

Each cloud task is already isolated. Use the existing checkout; create a Git
worktree only when explicitly requested.

## Setup and start

Run from the repository root:

```bash
bash scripts/setup-cloud-environment.sh
. /workspace/.setup/restrova/activate.sh
pnpm dev
```

The API runs on port 4000 and Vite normally runs on 5173. Restart these processes
in each new task. The default development configuration uses local SQLite and
the built-in assistant; no external model credentials or `.env` file are needed.
Preserve existing local configuration. Production and optional Ollama setup are
outside this workflow.

Check readiness from inside the environment:

```bash
curl --fail http://localhost:4000/api/health
curl --fail http://localhost:4000/api/ready
curl --fail http://localhost:5173/api/ready
```

Expect `ok` from health and `ready` with database `ok` from readiness. The last
request also checks Vite's API proxy. The frontend root should serve the Restrova
HTML page. Localhost addresses are internal checks, not public review links.

## Validation

```bash
NODE_USE_ENV_PROXY=0 pnpm validate
NODE_USE_ENV_PROXY=0 pnpm security:test
```

The activation script enables Node's environment proxy support for dependency
downloads. Disable it for these local checks because its experimental warning
pollutes CLI stderr that backend tests parse as JSON. TLS, checksums, and package
signature verification remain enabled.

Onboarding verified 168 frontend tests, 263 backend tests, 106 assistant
evaluations, 7 security gate tests, lint, formatting, and the production build.
The typecheck command succeeds, but no workspace package currently defines a
typecheck script. Registration and an authenticated dashboard request also
succeeded against a separate smoke-test database.

## Known application defect

An authenticated `GET /api/data/status` returns HTTP 500 on a fresh database.
`dataConnectionStatus` in `02-backend/server/src/dataImport.js` applies a
`branch_id` filter to `menu_items`, but that table has no `branch_id` column.
This setup change leaves application code and schema unchanged; the defect
requires a separate code fix.
