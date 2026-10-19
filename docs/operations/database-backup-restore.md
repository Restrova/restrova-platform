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

The repository now supplies a concrete AWS S3 backup runner, same-host systemd scheduler templates, retention, last-success monitoring and remote-download restore verification. **Tests use synthetic SQLite fixtures, a mocked object store and an injected AWS command runner. No production bucket, secret, scheduler or alert was configured.** Operator activation and a measured production-like recovery drill remain mandatory. Do not mark production readiness complete from these controlled tests.

## Off-service configuration

`src/services/offsiteBackup.js` retains the existing online-backup/AES-256-GCM format. Its job creates a unique encrypted archive, conditionally uploads it to AWS S3, downloads the exact object, compares SHA-256, authenticates/decrypts it and checks the restored SQLite integrity and foreign keys. Only after that verification does it record success and prune old archives. No npm dependency or HTTP backup endpoint is added.

Run it on the trusted **same host** as the local persistent SQLite volume, with the application's native Node/better-sqlite3 runtime and the official AWS CLI v2 installed. Do not copy a live `.db` file without its committed WAL data, introduce network-mounted SQLite or start another application writer. The online-backup API captures committed WAL data while the application is running.

The current adapter uses a single conditional S3 `PutObject`, with a conservative encrypted archive ceiling of 5,000,000,000 bytes. An oversized archive fails locally before upload; larger databases need a separately reviewed multipart implementation before enabling this runner.

The distroless application image intentionally contains neither AWS CLI nor systemd. **A separate Render cron cannot mount the live service's persistent disk, and these host timers cannot run inside its container.** Render off-service backup activation remains blocked until an operator selects and validates a supported consistent-snapshot/same-volume scheduling arrangement. Copying these units alone does not configure Render backups. Keep a single persistent-disk writer.

Configure these values privately through the host secret/config store:

| Variable                      | Required value                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_PATH`               | Absolute path to the persistent live SQLite database.                                    |
| `RESTROVA_BACKUP_WORK_DIR`    | Dedicated absolute work/status directory, mode `0700`, on encrypted storage.             |
| `RESTROVA_BACKUP_S3_BUCKET`   | Dedicated private AWS S3 bucket outside the application service/disk.                    |
| `RESTROVA_BACKUP_S3_PREFIX`   | Unique lowercase environment prefix, e.g. `production`; do not share across deployments. |
| `AWS_REGION`                  | Approved bucket region; assess residency/cross-border requirements before provisioning.  |
| `RESTROVA_BACKUP_KEY`         | Dedicated 32-byte AES key as 64 hexadecimal characters; never `JWT_SECRET`.              |
| `RESTROVA_BACKUP_KEY_VERSION` | Non-secret key rotation/recovery identifier, e.g. `backup-2026-10`.                      |

Use a host IAM role/standard AWS credential chain. If static AWS credentials are unavoidable, inject and rotate them securely; never commit them. The AWS command uses argument arrays without a shell, excludes backup/application encryption secrets from its child environment, ignores configured endpoint overrides and retains TLS verification. It never prints provider stderr. Install AWS CLI v2 from its official distribution and verify its signature using AWS instructions.

The operator must verify all of the following before activation:

- Account/bucket Block Public Access is enabled; ACLs are disabled with bucket-owner-enforced ownership; bucket policy denies non-TLS requests.
- Default server-side encryption is enabled. The job additionally requests `AES256` encryption; application-level GCM encryption remains independent.
- IAM permits only `s3:ListBucket` for the prefix, and `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:PutObjectTagging`, `s3:GetObjectTagging` on that prefix. A separate recovery identity has read access only. The job cannot change bucket policy or lifecycle rules. Only the backup job may write the `restrova-verified` tag; operators must not mark objects verified without downloading/authenticating/restoring them.
- Object-lock/versioning settings are reviewed against expiry requirements. Versioned deletes leave old data recoverable until noncurrent versions expire.
- The private work directory has capacity for a plaintext snapshot, encrypted archive, downloaded archive and restored verification database. Runtime disks are encrypted.
- Matching recovery keys are protected in a separate secret manager, including old versions until all matching archives expire. Rotating the active key does not re-encrypt historical archives. Object metadata records `restrova-key-version`.

## Daily execution and monitoring

From the repository root with frozen dependencies installed and configuration injected:

```sh
pnpm --filter server db:backup:offsite
pnpm --filter server db:backup:check
```

The first command succeeds only after a remote round trip, GCM authentication, SQLite verification, a `restrova-verified=true` object tag and retention completion. Upload/download/restore/tagging failures cannot start retention. Retention failure returns nonzero while preserving the newly verified recovery point. A failed remote verification may leave an untagged object until lifecycle cleanup; it is never counted as a successful backup or selected as a historical recovery point. Tag lookup failure fails closed without pruning.

Review `05-devops-qa/systemd/backup.env.example` and the five `restrova-backup*` unit templates. On a supported same-host Linux deployment, the operator must:

1. Adapt `/opt/restrova`, `/usr/bin/node`, the service user/group and local mount paths. Install the pinned Node runtime, server dependencies and AWS CLI. Host IAM authentication is preferred; `ProtectHome=true` deliberately prevents dependence on a user's home credential file.
2. Install units under `/etc/systemd/system`; create `/etc/restrova/backup.env` with mode `0600` from the secret manager, without printing secrets or putting them in shell history. Verify mount dependencies and private working-directory access.
3. Run `systemd-analyze verify`, manually execute `restrova-backup.service`, inspect its sanitized exit status and restricted recovery record, and independently verify private object access.
4. Enable/start `restrova-backup.timer` and `restrova-backup-monitor.timer`. Backup executes daily at **02:00 UTC**, with up to 60 seconds jitter and missed-run catch-up. Monitoring executes hourly. These schedules are explicit UTC and independent of host timezone.
5. Route the `restrova-backup` critical journal event to the on-call system and verify delivery to an operator. The included alert unit emits a local critical log; it does not configure an external provider. Monitor host/timer availability independently, since a failed host can stop backup and local checks together.

`db:backup:check` exits nonzero when the latest verified point is missing, more than 24 hours old, future-dated, or the latest job (including retention) failed. A fresh backup is required before its first success. Alert immediately on job failure and within the hourly interval on stale success. Keep an independent external last-success/host heartbeat monitor. Daily jitter may briefly approach the 24-hour boundary; investigate missing success rather than relaxing the threshold. Do not erase `status.json` merely to clear an alert.

An exclusive `run.lock` prevents overlapping backup/recovery jobs. A second job fails with `BACKUP_ALREADY_RUNNING`. After a crash, confirm its recorded PID/job is no longer running before manually removing a stale lock or abandoned `.run-*`/`.restrova-*` directories. Do not unconditionally delete locks automatically. Temporary directories can contain plaintext and require the same encrypted/private-disk controls.

## Retention and recovery records

The runner retains the newest verified object on each of the last seven UTC dates plus up to four older weekly recovery points, with no selected point older than 35 days. It only prunes its own exact archive filename pattern with the verified tag under the configured prefix. Untagged uploads never displace a valid historical recovery point and expire through the bucket lifecycle instead. Unrelated and future-dated objects are untouched and must be investigated separately. New installations accumulate weekly history over time. A same-day replacement is downloaded/restored and tagged before the older same-day point can be deleted.

Review and merge `05-devops-qa/systemd/s3-lifecycle.example.json` with the existing bucket lifecycle; do not blindly replace unknown rules. Its prefix must match configuration. The template marks current objects eligible for expiry after 34 days, allowing S3 UTC-day rounding within the 35-day objective, expires noncurrent versions after one day, cleans expired delete markers and aborts incomplete multipart uploads. **S3 lifecycle deletion is asynchronous: eligibility is not evidence of physical deletion by a deadline.** Review inventory/version listings and alert on over-age objects. A stricter regulatory deletion guarantee requires an approved provider/deletion policy. The example targets a dedicated nonversioned bucket; inspect historical versions if versioning was ever enabled.

During upload/verification failure the runner preserves the last known-good recovery point; lifecycle remains an independent expiry safety net. Prolonged failure can exhaust the recovery window, which must page an operator. Hidden delete markers alone do not prove customer data expiry.

`status.json` is atomically written with mode `0600` and preserves the last verified object, SHA-256, UTC verification time, key version and latest attempt. Record every success in a restricted operations log outside the service disk; the local status file is not a full history. Object metadata/checksum retrieved with the recovery identity can help identify older objects, but compare with the independent recovery record. Do not include customer content or keys in that log.

## Fetch and verify a chosen off-service recovery point

In an isolated trusted recovery environment, inject the matching key/version and use the exact object ID and base64 SHA-256 from the restricted recovery record:

```sh
pnpm --filter server db:backup:fetch 'production/ARCHIVE-ID.restrova-backup' /private-recovery/restored.db 'BASE64-SHA256-FROM-RECOVERY-RECORD'
```

Replace the example values with a real generated archive ID and checksum. Fetch downloads into private temporary storage, checks the encrypted object's identity, authenticates/decrypts it and validates SQLite before publishing a new destination. It cannot overwrite an existing database or sidecars, run migrations or seed accounts. It is a recovery verification command, not a production cutover.

## Restore to a new path

```sh
pnpm --filter server db:restore /private-recovery/daily-2026-10-04.restrova-backup /private-recovery/restored.db
```

Restore always uses a new destination. It refuses existing files or SQLite WAL/SHM/journal sidecars; there is no force-overwrite flag. Invalid keys, truncated/tampered archives, invalid SQLite files and broken foreign keys must fail without publishing the destination. Authentication and database checks finish before the restored database becomes visible. The command neither runs migrations nor seeds accounts. **Both local and off-service restore clear `auth_sessions` before publication: all users must log in again.** Otherwise, restoring a historical snapshot could resurrect sessions revoked after that snapshot. Reapply post-snapshot membership/password changes, deletion records and other security events as well; clearing sessions does not reconstruct these changes.

1. Recover an archive and its matching key privately. Start in an isolated environment with no public traffic or scheduled dispatchers.
2. Restore to a new path, verify exit status and `integrity: ok`, then compare expected migration versions, account/membership scope, table counts (except intentionally emptied sessions), import totals, ledger amounts and saved report schedules against the recovery record. Run financial and tenant-isolation checks. Test a fresh owner login without printing credentials.
3. For incompatible or older schemas, test the target application's startup migrations on a second recovery copy first. Do not downgrade database schema through a code rollback.
4. Stop live processes before replacing their database. Preserve the old database and related WAL/SHM files as one recovery set. Point DATABASE_PATH to the validated recovery copy, retaining JWT_SECRET. Only one application instance may write the disk.
5. Verify `/api/ready`, imported totals, role permissions, AI evidence and due-report behavior before reopening traffic. Historical due schedules may dispatch after startup; coordinate the maintenance window and check deduplication.
6. Record timing, recovery-point age, checks, operator and findings. Targets: RPO at most 24 hours and RTO at most 4 hours; these are policy objectives, not production measurements. Rehearse quarterly and after schema/key changes.

## Reproducible controlled evidence

`pnpm --filter server test:unit` includes `databaseBackup.test.js` and `offsiteBackup.test.js`. They exercise committed WAL recovery, separate Arabic/Chinese tenant records and exact financial totals, application schema/accounts/reports, restored session invalidation, wrong keys, tampering, malformed archives, broken foreign keys, overwrite/sidecar protection, private permissions and redacted failures. Off-service tests additionally cover real encrypted archive creation/recovery through a mocked provider, checksum corruption, upload and retention failures, exclusive locking, stale/failure monitoring, daily/weekly expiry and AWS command security flags. All fixtures are synthetic; no production export or real provider upload is used.

**Still unverified until operator activation:** AWS identity/provider access, bucket privacy/lifecycle deletion, installed host scheduler, external alert delivery, production recovery/migrations and measured RPO/RTO.

References: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md, https://nodejs.org/api/crypto.html, https://render.com/docs/disks, https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html, https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html.
