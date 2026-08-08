# DevOps and QA section — مهندس QA وDevOps

DevOps/QA owners work mainly in:

- [`../../Dockerfile`](../../Dockerfile)
- [`../../railway.json`](../../railway.json)
- [`../../render.yaml`](../../render.yaml)
- [`../../package.json`](../../package.json)
- [`../../pnpm-workspace.yaml`](../../pnpm-workspace.yaml)
- [`../../.env.example`](../../.env.example)
- [`../../docs`](../../docs)
- Test and validation scripts across `server/` and `web/`.

## Responsibilities

- Railway/Render deployment configuration.
- Environment variables and production safety checks.
- CI/CD validation commands.
- Release checklist.
- QA regression testing.
- Browser smoke testing.
- Persistent storage and database backup strategy.

## Must protect

- Production must have a strong `JWT_SECRET`.
- Production database storage must be durable.
- OpenAI keys must exist only in backend service variables.
- Health/debug endpoints must never expose secrets.
- Do not deploy with temporary local SQLite storage for real restaurants.

## Validation before release

```bash
pnpm lint
pnpm test
pnpm build
```
