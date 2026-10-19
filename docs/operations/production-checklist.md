# Production Checklist

## Required configuration

- `NODE_ENV=production`
- `JWT_SECRET` strong random value, at least 32 characters
- Absolute `DATABASE_PATH` lies inside the writable, separately mounted `DATABASE_VOLUME_PATH`
- `CLIENT_ORIGIN` set to the public frontend origin
- `BCRYPT_COST=12` or higher within supported limits
- `TRUST_PROXY_HOPS=0` for direct ingress; use `1` only for a verified fixed single trusted proxy path
- Optional Ollama credentials remain backend-only; no external model is required

## Before launch

- Branch protection enabled on `main`
- Required CI checks enabled
- CODEOWNERS teams created in the Restrova organization
- Secret scanning enabled
- Dependabot enabled
- Persistent storage attached
- [Operator handoff](production-operator-handoff.md) completed, including encrypted off-service backups, daily scheduling, retention, independent alerts and measured recovery
- `/api/health` returns `status: ok`
- `/api/ready` returns `status: ready`

## Not acceptable for real customers

- Ephemeral SQLite storage
- Placeholder `JWT_SECRET`
- OpenAI keys in frontend variables
- Direct pushes to `main`
- Disabled CI checks
- Missing backup plan
