# Backup and Restore Runbook (SQLite)

The backend ships a deliberately minimal backup toolkit: no external services,
no new dependencies — one source module (`02-backend/server/src/backup.js`),
two CLI scripts, and an optional in-process scheduler.

Backups use SQLite's `VACUUM INTO`, which writes a **consistent, checkpointed,
standalone snapshot** while the server keeps serving traffic (WAL-safe).

## What a backup is

- File: `restaurant-backup-YYYYMMDD-HHMMSS.db` (numeric suffix on same-second
  collisions) under the backup directory (default: `<database dir>/backups`,
  override with `BACKUP_DIR`).
- Sidecar: `<backup>.sha256` so restores verify integrity.
- Retention: only the newest `BACKUP_RETENTION_COUNT` backups are kept
  (default 7).

## Manual backup

Run from `02-backend/server` (safe while the server is running):

```bash
DATABASE_PATH=/var/data/restaurant.db node scripts/backup-db.js
# or with an explicit output directory:
DATABASE_PATH=/var/data/restaurant.db node scripts/backup-db.js --out /var/data/backups
```

Output: file path, size, sha256, `integrity_check: ok`, and retention
information. The script exits non-zero on any failure.

## Scheduled backups (optional, off by default)

Set in the environment (e.g. on Render/Railway):

```
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_COUNT=7
# BACKUP_DIR=/var/data/backups   (default: <database dir>/backups)
```

The scheduler starts with the server, logs `database_backup_scheduler_started`,
writes each backup to the **same durable disk** as the database, and keeps the
event log entries `database_backup_created` / `database_backups_pruned` /
`database_backup_failed` for monitoring.

On platforms where you control the host (VM, Docker with a mounted volume), a
cron job calling `scripts/backup-db.js` works equally well — pick one, not both.

## Restore procedure (tested drill)

> Stop the backend before restoring over the live database path.

1. Verify the backup (the restore CLI does this first and refuses bad files):

   ```bash
   node scripts/restore-db.js /var/data/backups/restaurant-backup-20260828-131336.db \
     --to /var/data/restaurant.db --force
   ```

2. The CLI prints `integrity_check` and core table row counts for the restored
   file, and removes stale `-wal`/`-shm` sidecars at the destination.
3. Restart the backend, then verify: `/api/health` → 200, a known login works,
   the dashboard loads.
4. Record the incident (see `incident-response.md`).

Restoring **refuses to overwrite an existing database** unless `--force` is
passed, and refuses checksum-mismatched backups outright.

## Tested drill (reference)

The end-to-end drill below is executed by the automated test suite
(`test/backup.test.js`) and was additionally executed live on a running server
during Phase 4 (2026-08-28):

1. Server running → register owner → chat message → orders inserted.
2. `backup-db.js` while the server was serving → `integrity_check: ok`,
   row counts captured.
3. Live database file deleted (simulated disaster).
4. `restore-db.js` → integrity ok, identical row counts.
5. Server restarted on the restored path → `/api/health` 200, the same owner
   logs in with the same password, dashboard 200.

## RPO / RTO guidance

- **RPO:** with the default 24h schedule, up to 24 hours of data loss. For
  tighter objectives lower `BACKUP_INTERVAL_HOURS` (e.g. 6) and keep copies
  **off the same disk** — the backup dir lives on the same volume, so for
  real customers periodically copy backups elsewhere (platform snapshots,
  `scp` from a cron job elsewhere). The CLI is designed for that.
- **RTO:** minutes — restore is a verified file copy plus a restart.
