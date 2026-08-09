# Production Checklist

## Required configuration

- `NODE_ENV=production`
- `JWT_SECRET` strong random value, at least 32 characters
- `DATABASE_PATH` points to durable storage
- `CLIENT_ORIGIN` set to the public frontend origin
- `BCRYPT_COST=12` or higher within supported limits
- OpenAI variables only on the backend service if OpenAI mode is used

## Before launch

- Branch protection enabled on `main`
- Required CI checks enabled
- CODEOWNERS teams created in the Restrova organization
- Secret scanning enabled
- Dependabot enabled
- Persistent storage attached
- Backup and restore process tested
- `/api/health` returns `status: ok`
- `/api/ready` returns `status: ready`

## Not acceptable for real customers

- Ephemeral SQLite storage
- Placeholder `JWT_SECRET`
- OpenAI keys in frontend variables
- Direct pushes to `main`
- Disabled CI checks
- Missing backup plan
