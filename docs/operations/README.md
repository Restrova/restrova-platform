# Operations

Operations documentation belongs here when it affects production readiness.

## Branch analytics

- [Branch performance model](branch-performance-model.md): recorded branch economics and period growth.
- [Branch ranking](branch-ranking.md): evidence requirements, leader definitions, ties and access scope.

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
