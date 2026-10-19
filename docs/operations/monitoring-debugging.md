# Monitoring and Production Debugging

## Health endpoints

- `GET /api/health`: process and AI mode status
- `GET /api/ready`: readiness check including database connectivity

Neither endpoint returns secrets.

## Structured logs

The backend emits JSON logs with:

- `timestamp`
- `level`
- `source`
- `environment`
- `event`
- `requestId`
- `method`
- `route`
- `status`
- `durationMs`

Logs must never include:

- `JWT_SECRET`
- `OPENAI_API_KEY`
- authorization headers
- database credentials
- full internal stack traces
- private restaurant exports

Request logs use registered route templates (or `unmatched`), never raw unknown
paths or query strings. Correlation IDs accept only bounded alphanumeric,
underscore and hyphen identifiers; invalid IDs receive a generated UUID.

## Debugging flow

1. Check latest deployment and CI result.
2. Check `/api/ready`.
3. Search logs by `requestId`.
4. Confirm whether failures are auth, validation, AI provider, database, or deployment related.
5. If customer data may be affected, open an incident.

## Operator activation

Before real customer launch, add:

- uptime monitoring
- error-rate alerts
- latency dashboards
- daily verified off-service backups and hourly stale/failure monitoring; wire the [backup timer and alert templates](database-backup-restore.md) to an external on-call destination and monitor host/timer heartbeat independently
- audit log review
- AI provider failure-rate alerts

The templates emit a local critical journal message. Installing them does not
configure external alert delivery or prove a live production backup exists.
Complete the [production operator handoff](production-operator-handoff.md).
