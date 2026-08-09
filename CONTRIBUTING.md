# Contributing

Thanks for helping build Restaurant Decision AI. This repository is a single pnpm monorepo, organized by team ownership:

- `02-backend/` — backend API, auth, database, restaurant tools.
- `03-frontend/` — React/Vite frontend, shell, routes, UI foundations.
- `04-data-ai/` — evaluation data and assistant quality ownership.
- `05-devops-qa/` — deployment, QA, operations, and release documentation.

## Requirements

- Node.js 22 or newer.
- pnpm 11 or newer.

Use pnpm only. Do not add npm, yarn, or mixed package-manager instructions.

```bash
corepack enable
pnpm install
```

## Local development

```bash
pnpm dev
```

The backend runs on `http://localhost:4000` and the frontend runs on `http://localhost:5173`.

## Required checks before merging

Run the full validation command before opening or merging a pull request:

```bash
pnpm validate
```

This runs:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Branch and commit guidance

- Keep business logic changes separate from repository-foundation or documentation changes.
- Update tests or evals when behavior changes.
- Do not commit secrets, private restaurant data, imported books, generated databases, or local `.env` files.
- Prefer small pull requests with a clear owner section.

## Team ownership

See `05-devops-qa/docs/team-ownership.md` and `.github/CODEOWNERS`.
