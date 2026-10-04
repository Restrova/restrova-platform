# Encrypted database backup and restore

## Operator boundary

These commands run inside the trusted service host or an isolated recovery environment. There is no HTTP backup endpoint and no ordinary tenant can download the multi-tenant database. Only authorized infrastructure operators may access these archives. Backups contain password hashes, restaurant records, chat and import evidence: never attach them to GitHub, support tickets or public storage. CLI logs contain only action, status and a sanitized error code.

## Create and retain

Provide `RESTROVA_BACKUP_KEY` privately through the environment: exactly 64 hexadecimal characters generated from 32 cryptographically random bytes. Use a dedicated backup key, never JWT_SECRET. Keep its recovery copy in the operator's secret manager separately from archives; losing it makes recovery impossible. Retain old keys until every archive encrypted with them expires. Do not pass keys on command lines or print them in logs.

From the repository root, with an existing private destination directory:

```sh
pnpm --filter server db:backup /var/data/restrova/restaurant.db /var/data/backups/daily-2026-10-04.restrova-backup
```

Use a unique filename per run. The SQLite online backup API captures committed WAL data while the application remains online. The command checks SQLite integrity and foreign keys before streaming AES-256-GCM encryption. Each archive has a random 12-byte nonce and a 16-byte authentication tag. Header, nonce and ciphertext are authenticated. Memory usage is streamed rather than loading the full archive. Archive permissions are 0600; temporary plaintext is in a private 0700 directory and removed on success or failure. An interrupted/crashed process may leave a private temporary directory: operators must remove abandoned directories after confirming no backup/restore process is active. OS-level disk encryption is still required for plaintext runtime storage.

Policy target: one daily off-service copy, seven daily and four weekly recovery points, maximum 35 days. Store archives in private encrypted object storage with least-privilege write access for backup jobs and separate restricted recovery access. Apply lifecycle expiry and verify deletion. Backups on the same Render disk alone do not meet this policy. Never delete a last known-good recovery point before verifying its replacement. Record archive ID, UTC creation time, key version, upload success and restore-check result separately; no customer content. Alert the operations owner if no verified off-service copy exists within 24 hours. Normal account deletion may remain in backups until expiry; any recovery must reapply deletion records before reopening traffic.

This PR supplies local backup and restore tooling and controlled restore tests. It does **not** configure an object-store destination, lifecycle policy, scheduler, production alert or production recovery drill. Production policy activation remains blocked by those settings and persistent storage. Track activation under #140 and production recovery exercise under #141/#168. Do not mark production readiness complete from a local restore test.

## Restore to a new path

```sh
pnpm --filter server db:restore /private-recovery/daily-2026-10-04.restrova-backup /private-recovery/restored.db
```

Restore always uses a new destination. It refuses existing files or SQLite WAL/SHM/journal sidecars; there is no force-overwrite flag. Invalid keys, truncated/tampered archives, invalid SQLite files and broken foreign keys must fail without publishing the destination. Authentication and database checks finish before the restored database becomes visible. The command neither runs migrations nor seeds accounts.

1. Recover an archive and its matching key privately. Start in an isolated environment with no public traffic or scheduled dispatchers.
2. Restore to a new path, verify exit status and `integrity: ok`, then compare expected migration versions, account/membership scope, import totals, ledger amounts and saved report schedules against the recovery record. Run financial and tenant-isolation checks. Test an owner login without printing credentials.
3. For incompatible or older schemas, test the target application's startup migrations on a second recovery copy first. Do not downgrade database schema through a code rollback.
4. Stop live processes before replacing their database. Preserve the old database and related WAL/SHM files as one recovery set. Point DATABASE_PATH to the validated recovery copy, retaining JWT_SECRET. Only one application instance may write the disk.
5. Verify `/api/ready`, imported totals, role permissions, AI evidence and due-report behavior before reopening traffic. Historical due schedules may dispatch after startup; coordinate the maintenance window and check deduplication.
6. Record timing, recovery-point age, checks, operator and findings. Targets: RPO at most 24 hours and RTO at most 4 hours; these are policy objectives, not production measurements. Rehearse quarterly and after schema/key changes.

## Reproducible controlled evidence

`pnpm --filter server test:unit` includes `databaseBackup.test.js`. It exercises committed WAL recovery, separate Arabic/Chinese tenant records and exact financial totals, full application schema/table counts and password-hash preservation, wrong keys, ciphertext tampering, missing input, malformed archives, broken foreign keys, overwrite/sidecar protection, private file permissions, cleanup and redacted CLI failures. All fixtures are synthetic; no production export is used.

References: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md, https://nodejs.org/api/crypto.html, https://render.com/docs/disks.
