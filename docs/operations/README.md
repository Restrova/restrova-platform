# Operations

Operations documentation belongs here when it affects production readiness.

## Required production practices

- Use durable database storage.
- Keep `JWT_SECRET` strong and private.
- Keep AI provider keys backend-only.
- Configure `CLIENT_ORIGIN` for the deployed frontend domain.
- Run `pnpm validate` before merging.

## Deployment references

- Railway config: `railway.json`
- Render config: `render.yaml`
- Dockerfile: `05-devops-qa/Dockerfile`

## Backup and recovery

Before real restaurant data is stored, create and test:

- Backup schedule.
- Restore runbook.
- Retention policy.
- Recovery-time and recovery-point objectives.
