# Scheduled executive reports and source health

Owners can schedule a branch or whole-restaurant executive report from **Reports → Scheduled reports**. Reports arrive in the authenticated Restrova report inbox, not by email. Existing executive report logic supplies exact financial values, evidence, unavailable-data warnings, currency and data revision. Saved reports are immutable snapshots; later imports update current reports, not saved history.

## Cadence and timezone

- Daily: previous complete local day.
- Weekly: Monday, previous Monday through Sunday.
- Monthly: first local day, previous complete calendar month.
- The chosen hour uses the restaurant timezone captured when creating the schedule. A timezone change does not silently move existing schedules; pause the old schedule and create a new one.
- DST gaps skip the unavailable local hour; repeated hours produce one report. Quarter-hour timezone offsets are supported.
- Twenty schedules maximum per owner/restaurant. Pause/resume is supported; resuming starts at the next upcoming occurrence rather than replaying paused periods.

## API and permissions

`GET/POST /api/reports/schedules`, `PATCH /api/reports/schedules/:id` (`enabled` boolean only), and `GET /api/reports/scheduled/:id` require current owner permissions. Lists and snapshots are scoped by organization, restaurant and creator. Branch IDs are checked against the current restaurant. Delivery rechecks organization membership, owner role and branch scope. Removed/demoted owners are disabled before generation. The API accepts no delivery address or remote URL.

## Worker and recovery

Migration `0014_scheduled_reports.sql` creates durable schedule and run tables. The existing API process dispatches every 60 seconds outside tests. There is no external cron or queue dependency. Up to 20 due schedules run per tick; transactions and a unique `(schedule_id, scheduled_for)` key prevent duplicate snapshots. Restart resumes overdue occurrences using their original period. Keep the SQLite persistent disk and single application instance; do not use independent databases for concurrent workers.

Failures store a sanitized code and retry after 15 then 30 minutes. After the third failed attempt the schedule advances to its next occurrence and preserves the failed inbox entry. Check source/branch permissions and the `scheduled_reports` structured event counts. A dispatcher-level failure emits `scheduled_reports_failed`, with no report content or credentials. Pause schedules before planned scope changes. Snapshot retention follows database backup policy; automatic deletion is not implemented in this batch.

## Branded PDF

The current or selected saved executive report includes Restrova branding, reporting dates, currency, claims, evidence, recommendations and trends. **Print / save PDF** uses the browser's print dialog and A4 print styles. Choose **Save as PDF** to produce a file. It is not a server-side downloadable PDF endpoint. Navigation, filters, scheduling controls and debug details are excluded. Print styling preserves Arabic direction and includes only the displayed report. CSV export remains available for the current report; it is disabled while viewing a saved snapshot to prevent exporting another period accidentally.

## Source health

`GET /api/integrations/health` is owner-only and scoped to the selected organization/restaurant. The Data sources screen shows awaiting first import, imported or needs review, last successful import, confirmed imported-record totals and latest rejected rows. Refresh follows preview/mapping/confirmation. Confirmation already announces the shared data revision to Home/AI/report queries.

Current adapters are **manual CSV imports**. They truthfully expose `liveConnection: false`, `nextSyncAt: null`, and a manual next update. No external POS/delivery/accounting connection or automatic synchronization is claimed. #88 remains dependent on future #87 scheduler/adapters for live sync health.

## Verification

Backend tests cover cadence/timezones/DST, exactly-once delivery, immutable data-backed snapshots, owner/branch/tenant boundaries, removed membership and three-attempt recovery. Frontend tests cover cadence/hour creation, pause, saved report loading, sanitized errors, Arabic/Chinese controls and browser print invocation. Run the repository quality gate before merging.
