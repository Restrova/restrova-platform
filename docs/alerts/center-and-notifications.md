# Alert center and notifications — Tasks 6.2–6.7

## Delivered scope

| Issue | Capability                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| #48   | Historical same-weekday baseline, robust range and reproducible outliers                                          |
| #49   | INFO, WARNING and CRITICAL severity with reason/version                                                           |
| #50   | `/app/alerts`: open/resolved views, evidence and suggested action                                                 |
| #51   | Email, native browser push/FCM, approved WhatsApp templates, enterprise Slack/Teams adapters and a durable outbox |
| #52   | Per-user types, thresholds, branches, frequency, channels and consent                                             |
| #53   | Resolve/reopen, assign, comment, immutable audit events and recurrence                                            |

Apply additive migration `0008_alert_center.sql` with the normal migration runner. It creates preferences, incidents, history and delivery tables with scope, history and due-delivery indexes. Existing data and auth contracts are preserved.

## Historical baseline and severity

`GET /api/alerts/anomalies` accepts authorized `scope`, `restaurantId`, `branchId`, optional ISO `anchor`, `historyDays` (29–365, default 57), and `language=ar|en|zh`. The anchor's local date is incomplete and excluded. The target is the previous local date; prior observed same weekdays form its baseline. At least four are required, with explicit operating lifecycle evidence. Missing dates are not zero-filled.

The center is the median of net sales. The half-range is the greater of one minor unit, 10% of the absolute median, and 4.4478 × median absolute deviation (MAD), rounded upward. Values strictly outside the range trigger. The target day is never part of its own baseline. Evidence includes individual historical dates, monetary values and sales/ledger identifiers. Weekly seasonality is modeled; holidays, annual seasons, temporary closures and missing transactions are not inferred.

Severity version `6.3-v1`: non-triggering or insufficient results are INFO. Triggered rules are WARNING unless the measured rate reaches both twice its configured threshold and at least ten percentage points above that threshold; then CRITICAL. Anomalies become CRITICAL at three range half-widths from the median. Remaining anomalies are WARNING. Severity is triage, not a claim about expected financial loss.

## APIs and lifecycle

- `GET/PUT /api/alerts/preferences`: personal preferences; arbitrary recipient email addresses or outbound URLs are not accepted. The profile email is used for email delivery. Thresholds follow [the rules engine](rules-engine.md). Empty branch selection means none; null means all currently authorized branches. Defaults disable outbound notifications.
- `POST /api/alerts/refresh`: owner/branch-manager evaluation of the last seven completed days plus the 57-day anomaly history. Accepts authorized scope and an optional pinned anchor. Applies the caller's saved thresholds/types/branches and saves triggered results transactionally. Viewers cannot create or edit incidents.
- `GET /api/alerts`: authorized open/resolved/all views with `limit` (max 100) and `before` cursor. Query keys and server scope checks prevent stale cross-branch results.
- `GET /api/alerts/:id/history`: current version, eligible assignees and latest 200 immutable activity events. All older events remain in the database.
- `PATCH /api/alerts/:id`: `version` plus `action=resolve|reopen|assign|comment`. Assignment requires an owner or the incident branch's manager in the same organization. Comments are plain text, 1–2000 characters. A stale version returns 409; reload before retrying.
- `GET /api/alerts/notifications`: channel availability, the public VAPID key if configured, and the caller's delivery counts. Private provider credentials are never returned.
- `POST /api/alerts/notifications/queue`: queues the caller's opted-in notifications. This does not perform an external send in the request.

An incident is a frozen evaluation snapshot keyed by organization, branch, rule, local evaluation date and threshold signature. Repeated evaluations do not duplicate it. Corrections to source data do not silently rewrite a past snapshot or resolve it; evaluate a later window and record the resolution/comment. Recurrence counts distinct earlier evaluation dates for the same branch and rule, ignoring repeat evaluations and same-date threshold changes. Reopening an incident is tracked separately in history.

UI controls, rule labels, suggested review actions and states support Arabic RTL, English and Chinese. The interface distinguishes no saved alerts from insufficient evidence. No model/provider change, inferred causes or savings figures are introduced.

## Delivery configuration

Set `ALERT_NOTIFICATION_CONFIG` in the deployment's secret environment to a JSON object keyed by **organization ID**. Each value may contain:

```json
{
  "123": {
    "email": { "apiKey": "<Resend key>", "from": "<verified sender>" },
    "push": {
      "publicKey": "<VAPID public key>",
      "privateKey": "<VAPID private key>",
      "subject": "mailto:<operator email>"
    },
    "whatsapp": {
      "token": "<Cloud API token>",
      "phoneId": "<business phone id>",
      "apiVersion": "<supported vN.N>",
      "template": "<approved template>",
      "language": "ar"
    },
    "enterprise": true,
    "slack": { "webhook": "<tenant-authorized Slack incoming webhook>" },
    "teams": { "webhook": "<tenant-authorized Teams Workflow webhook>" }
  }
}
```

These are placeholders; no credentials are shipped. Keep tenant settings separate. Webhooks are provisioned by the operator for the intended workspace/channel, never submitted by arbitrary API users. Enterprise adapters require explicit `enterprise: true`; this is a deployment entitlement until billing plans are implemented. Slack permits only `hooks.slack.com`; Teams permits HTTPS Azure Logic Apps and Power Platform environment hosts. Redirects, embedded credentials, custom ports and unrecognized hosts are rejected.

Native browser push uses a one-time VAPID key pair generated with the `web-push` library. The user clicks **Enable notifications on this device**, grants the browser prompt, then saves preferences. A secure origin and browser push support are required. The service worker displays the notification and opens only `/app/alerts`. Subscriptions are validated against supported Google, Mozilla and Apple push hosts; payloads are encrypted with `aes128gcm`. No private key enters the browser. Turning the channel off stops server sends; the browser may retain its local subscription.

For an existing native/FCM client, `push` can instead contain `projectId` and an operator-refreshed OAuth `accessToken`, with its registered device token supplied through personal preferences. Browser activation uses VAPID, not manually entered tokens. Expired provider tokens fail visibly; automatic OAuth provisioning is outside this change.

WhatsApp requires per-user opt-in and an E.164 phone number. Configure a provider-approved template with exactly two body parameters: alert ID, then alert title. The operator supplies a supported API version and confirms template approval/recipient eligibility. The adapter never sends arbitrary free-form WhatsApp marketing text. Disabling consent before dispatch cancels queued delivery.

## Running and monitoring the outbox

Run `pnpm --filter server alerts:dispatch` through the deployment's scheduled job runner (for example once per minute). It visits existing preferences and current memberships, queues authorized open incidents, then dispatches bounded batches per organization. It does not create incident evaluations; those are explicitly initiated through **Evaluate data**. No live job or provider account is provisioned by this PR.

Frequency means a maximum of one delivery per alert/channel/user in the selected UTC window: once ever for immediate, once per day, or once per Monday-based week. These are individual reminder messages, not a combined digest. Each queue invocation considers the latest 1,000 open incidents per authorized context; dispatch processes up to 50 due deliveries per organization. Operators with larger backlogs should monitor counts and deliberately expand capacity rather than assume unlimited throughput.

A transaction-safe claim prevents simultaneous workers from sending the same pending row. Membership, branch access, status, preferences and WhatsApp consent are checked again immediately before each attempt. Resolved incidents and revoked access cancel delivery. HTTP 429/5xx and transient network failures retry at exponential one-minute intervals, up to five attempts; stale claims recover after five minutes, and exhausted claims become failed. Resend gets a stable idempotency key. Other providers are at-least-once: a crash after provider acceptance but before committing status can cause a duplicate; push tags collapse repeats on the device.

`sent` means the provider accepted the request, not that a human read it or the device received it. Status counts and generic error codes are retained; provider response bodies, keys and recipient payloads are not logged. Logs contain organization IDs and aggregate worker outcomes only.

## Verification and production boundary

Automated tests cover statistical inputs, severity, localization, tenant/role isolation, immutable history, conflict handling, recurrence, preference validation, all provider request shapes, encrypted native push, permission denial, deduplication, retries, exhausted/stale claims, consent and revocation. External transports are mocked: **no real messages are sent by tests**. Live provider acceptance and a scheduled production worker require deployment-specific configuration and have not been claimed as tested. UI tests cover English, Arabic RTL, Chinese, failure/retry and viewer restrictions; no manual browser screenshot review is claimed.

Provider contracts: [Resend](https://resend.com/docs/api-reference/emails/send-email), [Web Push](https://github.com/web-push-libs/web-push), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/), [Teams webhooks](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook), [WhatsApp templates](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/).
