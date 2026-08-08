# 05 — DevOps and QA / مهندس QA وDevOps

This section is owned by the DevOps/QA engineer.

## Main code and assets

- [`Dockerfile`](Dockerfile) — production container build.
- [`docs/`](docs/) — architecture, acceptance, MVP, and ownership documentation.
- [`github-templates/`](github-templates/) — GitHub templates such as CODEOWNERS examples.

Root-level files such as `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `railway.json`, `render.yaml`, `.env.example`, `.gitignore`, and `.dockerignore` remain at the repository root because package managers and deployment services expect them there.

## Responsibilities

- Deployment configuration.
- Environment variable safety.
- CI/release checks.
- QA validation.
- Production storage and backup planning.

## Run release validation

From the repository root:

```bash
pnpm lint
pnpm test
pnpm build
```
