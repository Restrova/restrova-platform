# Restrova persistent SQLite on Render — proposed paid setup

This configuration is prepared for review. Do not provision a paid service or disk until the account owner approves the recurring cost. Apply it to the existing `ai-restaurant-manager` service; do not create a second service accidentally when importing a Blueprint.

## Repository configuration and unverified live state

Both checked-in Render definitions now select paid persistent storage, one instance, checks-pass deployment gating and `/api/ready`. This coding task did not inspect or modify the live Render service. Earlier free-service observations are historical and do not establish its current plan or storage. Free service local files remain ephemeral and are unsuitable for customer records; startup now requires an actual writable data mount.

## Reviewable target

- Existing Node web service, Oregon, Starter paid compute.
- One instance; 1 GB disk mounted at `/var/data`.
- `DATABASE_PATH=/var/data/restrova/restaurant.db`.
- `DATABASE_VOLUME_PATH=/var/data`, verified against Linux mount metadata at startup.
- `TRUST_PROXY_HOPS=1` only after verifying Render's fixed proxy path and forwarded-header rewriting.
- Preserve the existing `JWT_SECRET`; `sync: false` avoids storing or rotating it in the repository. Supply the existing secret privately if adopting a Blueprint prompts for it.
- Keep CI-gated auto deploys. Use `/api/ready` so database readiness is checked.
- No new database engine, scheduler service, queue, API dependency or workspace-plan upgrade.

Render's published Starter compute price is $7/month; persistent disk storage is priced separately (listed as $0.25/GB/month on the pricing page). Confirm the account's current estimate/taxes before applying. Disk-backed services remain single-instance and have a brief deploy outage.

## Preserve data before changes

Attaching a disk triggers a redeploy. Adding a disk does not migrate existing ephemeral data. Before any change that redeploys the service, retain the original imported files and take a consistent SQLite backup through the currently running instance when access is available (SQLite online backup API or `VACUUM INTO`, not copying an active database/WAL independently). Download and validate that backup privately. Do not commit the database, tokens or exports.

If the free instance cannot provide shell/SSH access, stop here until there is an accessible backup or the owner explicitly accepts rebuilding from retained imports. Application CSV reports are not a full backup of accounts, membership, imports, evidence or schedules. Do not claim the original ephemeral database was preserved by enabling a disk.

## Apply after approval

1. Confirm the migration/backup plan and paid estimate in the existing service Dashboard.
2. Upgrade the instance and attach the 1 GB disk at `/var/data`, preserving existing secrets. Coordinate settings because disk creation triggers deployment.
3. Restore the validated consistent database to `/var/data/restrova/restaurant.db` before directing live traffic to it. Stop the application while replacing/restoring its database; never overwrite an open SQLite database.
4. Set both database and volume paths, keep one instance and checks-pass deployment trigger, and use `/api/ready`.
5. Start the service. Runtime startup applies the existing transactional migrations; disks are not available during build or pre-deploy commands.
6. Verify readiness, owner login, tenant isolation, imported totals, AI evidence and saved schedules. Confirm one due report is delivered exactly once.
7. Redeploy a harmless commit and verify the same non-sensitive record IDs and totals remain. This persistence check is required before closing #106's deployment blocker.

Use database-native backups for recovery, rather than relying on filesystem snapshots alone. The [backup runner and runbook](database-backup-restore.md) provide encrypted off-service verification, retention and host timer templates. These host timers cannot run inside managed Render or access its disk from a separate cron service. Operator selection/validation of a supported same-volume backup arrangement, real bucket activation, external alerts and a measured restore drill remain launch prerequisites. Follow the [operator handoff](production-operator-handoff.md).

References: https://render.com/docs/disks, https://render.com/docs/free, https://render.com/pricing, https://render.com/articles/render-vs-railway.
