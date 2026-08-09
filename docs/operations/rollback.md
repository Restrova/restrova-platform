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

SQLite rollback is currently backup-restore based. Before real customers, Restrova must add:

- automated backups
- restore drills
- migration versioning
- documented RPO/RTO

Do not manually edit a production database file during an incident unless a backup exists and the incident commander approves.
