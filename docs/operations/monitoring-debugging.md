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

## Debugging flow

1. Check latest deployment and CI result.
2. Check `/api/ready`.
3. Search logs by `requestId`.
4. Confirm whether failures are auth, validation, AI provider, database, or deployment related.
5. If customer data may be affected, open an incident.

## Future monitoring

Before real customer launch, add:

- uptime monitoring
- error-rate alerts
- latency dashboards
- database backup monitoring
- audit log review
- AI provider failure-rate alerts
