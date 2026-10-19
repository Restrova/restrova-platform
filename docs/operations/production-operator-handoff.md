# Production operator handoff

These repository changes are not deployed. No live secrets, storage, bucket,
timers, alerts or branch-protection settings were changed. Keep customer launch
blocked until a named operator records the evidence below in the private release
record. Never put customer exports or credential values into that record.

## Release and security evidence

1. Review the exact release SHA. Require successful quality, dependency,
   CodeQL source and production-container jobs in branch protection. Preserve
   private logs/SARIF/Trivy reports before artifact expiry. See
   [vulnerability scanning](../security/vulnerability-scanning.md).
2. Confirm the service deploys only approved commits after those checks. Both
   Render definitions use `checksPass`; Railway requires operator gating.
3. Announce forced re-login: old JWTs lack durable sessions. Apply transactional
   migrations at startup and test owner/manager/viewer access across two test
   tenants. Review [session operation](authentication-sessions.md).

## Storage and ingress

- Provision a durable mounted volume before deploying. Render uses `/var/data`;
  Docker/Railway use `/data`. Set `DATABASE_VOLUME_PATH` to the actual mount
  root and an absolute `DATABASE_PATH` beneath it. Do not mount a temporary
  filesystem or nested filesystem over the database directory. Startup checks
  Linux mount metadata, writable mount flags and symlink boundaries; it cannot
  certify the provider's retention, encryption, account ownership or SLA.
- Keep one SQLite writer/service instance and use a local mounted block volume.
  Do not share live SQLite over a network filesystem or run multiple replicas.
- Preserve an authenticated, consistent encrypted backup before migrating any
  ephemeral database. Attaching a new volume does not migrate old data.
- Stop the old writer before restoring or repointing storage. Verify readiness,
  exact imported totals and tenant permissions; perform a controlled restart
  and confirm the same records remain. Retain recovery evidence.
- Preserve existing JWT and provider credentials in the secret manager. Do not
  rotate them as an incidental deployment step. Require HTTPS and approved
  `CLIENT_ORIGIN` values.
- Direct ingress defaults to `TRUST_PROXY_HOPS=0`, ignoring forwarded client IP
  headers. Render templates declare one hop. Verify the actual topology and
  that the edge overwrites forwarded headers and prevents shorter/direct
  access before using a nonzero value. Test forged forwarding headers and
  IPv4/IPv6 authentication limits. In-process limits assume one application
  instance; add shared limiting before changing that deployment constraint.
- Confirm the hosting/data-processing region and cross-border transfer policy
  with the responsible privacy owner. The repository still selects Oregon in
  `render.yaml`; no residency compliance claim is made.

## Backups and recovery

Follow [encrypted off-service backups](database-backup-restore.md) for the exact
runner, restricted S3 permissions, independent backup key, download/restore
verification, retention and systemd units. Provision the actual private bucket,
host role, key recovery copy and supported scheduler privately. The systemd
template is for a trusted host with local access to the database volume; it does
not run inside Render managed Node or the distroless application container.
Resolve that hosting/scheduling prerequisite before declaring backups active.

Run a first real backup, independently download the recorded object and restore
to a new private path. Verify schema, tenant membership, financial totals and
fresh login. Restore deliberately invalidates all sessions. Record object ID,
checksum, key version and measured RPO/RTO. Targets: <=24 hours RPO and <=4 hours
RTO; exercise recovery quarterly and after schema/key changes. Reapply customer
deletion records before reopening recovered traffic.

## Monitoring and activation sign-off

- Enable the daily backup and hourly freshness timers on the selected supported
  host. Wire the failure journal to an externally monitored alert destination;
  verify delivery with a controlled failed job. A journal message alone is not
  paging. Independently monitor missing timer/host heartbeats so a stopped host
  cannot silently stop both backup and monitoring.
- Verify object lifecycle and noncurrent-version expiry, least-privilege access,
  and recovery key access. Keep a current off-service copy and deletion/expiry
  evidence. No real S3 upload or production restore was run by this coding task.
- Monitor `/api/ready`, 5xx/error rates, latency, disk space, SQLite errors,
  authentication failures and backup age. Investigate drift and alert failures.
- Record release SHA, operator, checks, storage restart evidence, first verified
  off-service recovery point, restore measurement and alert exercise before
  opening customer traffic. Outstanding configuration is a release blocker.
