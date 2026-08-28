# Rollback Runbook

## Application rollback

1. Identify the last known-good deployment.
2. Confirm whether the failed release included database changes.
3. Redeploy the last known-good commit or platform deployment.
4. Verify:
   - `/api/health`
   - `/api/ready`
   - login
   - dashboard
   - chat response
5. Record the incident and follow-up issue.

## Database rollback

SQLite rollback is backup-restore based. The backup/restore toolkit
(`scripts/backup-db.js`, `scripts/restore-db.js`, optional `BACKUP_ENABLED`
scheduler) and the tested restore drill are documented in
`backup-restore.md`. Migration versioning exists in `db/migrations/`
(`0001`–`0006`, tracked in `schema_migrations`). RPO/RTO guidance is in the
backup runbook.

Do not manually edit a production database file during an incident unless a backup exists and the incident commander approves.
