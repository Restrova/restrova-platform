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

SQLite rollback uses the [encrypted off-service backup and restore procedure](database-backup-restore.md). Numbered migrations are transactional and versioned; the backup runner, retention and scheduler templates are checked in. Operators must activate and verify them for the selected host. Local tests do not establish production recovery readiness. Targets are RPO <=24 hours and RTO <=4 hours, measured in a controlled production recovery drill.

Restore to a new path, never over the open database. The restore tool clears all persisted authentication sessions before publishing the recovered file, so users must sign in again. Reapply customer deletion records and test the target application/migrations on a recovery copy before opening traffic. Preserve the original database and WAL/SHM set. Do not downgrade a migrated schema by deploying an older application blindly.

Do not manually edit a production database file during an incident unless a backup exists and the incident commander approves.
