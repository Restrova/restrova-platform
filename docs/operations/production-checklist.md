# Production Checklist

Full setup instructions: see `production-setup.md` (environment variables,
HTTPS/proxy notes, rate limits, OpenAI mode). Backup/restore runbook:
`backup-restore.md`.

## Required configuration

- `NODE_ENV=production`
- `JWT_SECRET` strong random value, at least 32 characters (startup fails otherwise)
- `DATABASE_PATH` points to durable storage (startup fails on `/tmp`-style paths)
- `CLIENT_ORIGIN` set to the public frontend origin
- `BCRYPT_COST=12` or higher within supported limits
- OpenAI variables only on the backend service if OpenAI mode is used
- `ENABLE_DEMO_SEED` unset (demo restaurant must never exist in production)

## Before launch

- Branch protection enabled on `main`
- Required CI checks enabled
- CODEOWNERS teams created in the Restrova organization
- Secret scanning enabled
- Dependabot enabled
- Persistent storage attached
- Backup configured (`BACKUP_ENABLED=true` or scheduled CLI runs) **and the
  restore drill in `backup-restore.md` executed at least once**
- `/api/health` returns `status: ok`
- `/api/ready` returns `status: ready`
- Startup log shows the intended AI mode (an `ai_demo_mode_in_production`
  warning means `OPENAI_API_KEY` is missing — confirm that is intended)

## Not acceptable for real customers

- Ephemeral SQLite storage
- Placeholder `JWT_SECRET`
- OpenAI keys in frontend variables
- Direct pushes to `main`
- Disabled CI checks
- Missing backup plan
