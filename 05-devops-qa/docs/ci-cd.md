# CI/CD

Date: 2026-08-09

This repository uses GitHub Actions for continuous integration. CI validates the monorepo but does not deploy from pull requests.

## Workflows

### `.github/workflows/ci.yml`

The primary production-quality CI workflow runs on:

- Pull requests.
- Pushes to `main`.

It executes one required quality gate job:

1. Checkout.
2. Configure the supported Node.js version from `.nvmrc`.
3. Enable Corepack.
4. Restore/cache the pnpm dependency store.
5. Install dependencies with `pnpm install --frozen-lockfile`.
6. Run frontend lint with `pnpm lint`.
7. Run formatting verification with `pnpm format:check`.
8. Run type/static checks with `pnpm typecheck`.
9. Run backend tests with `pnpm --filter server test:unit`.
10. Run frontend tests with `pnpm --filter web test`.
11. Run AI evaluation tests with `pnpm --filter server eval`.
12. Run the production frontend build with `pnpm build`.

Any failure stops the job and fails CI.

The workflow sets:

- `CI=true`
- `NODE_ENV=test`
- `DATABASE_PATH=${{ runner.temp }}/restaurant-ci.db`

The temporary database path prevents CI tests from using a persistent or production database.

### `.github/workflows/validate.yml`

This legacy foundation workflow runs `pnpm validate`. It is still safe, but `ci.yml` is the explicit step-by-step workflow that should be treated as the primary CI definition.

## Dependency updates

Dependabot is configured in `.github/dependabot.yml`.

It opens scheduled weekly pull requests for:

- pnpm/npm package dependencies.
- GitHub Actions versions.

Dependency updates are grouped by frontend, backend, tooling, and GitHub Actions where possible. Dependency pull requests must still pass CI before merging.

## Deployment policy

CI does not automatically deploy from pull requests.

Production deployment should remain a separate, explicitly approved process until:

- P0 data durability is closed.
- Backup and restore are tested.
- Environment variables are validated.
- A rollback process is documented.

## Local equivalent

Before merging, run the same checks locally:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm --filter server test:unit
pnpm --filter web test
pnpm --filter server eval
pnpm build
```

The shorthand command remains:

```bash
pnpm validate
```
