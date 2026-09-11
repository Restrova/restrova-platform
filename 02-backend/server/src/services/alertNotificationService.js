import webpush from "web-push";
import { isTrustedPushEndpoint } from "./pushSubscription.js";
import { db } from "../db.js";
import { getAuthContext } from "../repositories/authRepository.js";
import { getPreferences, authorizedBranches, channels } from "./alertCenterService.js";

// Operator-provisioned, tenant-keyed configuration; never accept outbound URLs from API callers.
export function notificationConfig(organizationId) {
  try {
    return JSON.parse(process.env.ALERT_NOTIFICATION_CONFIG || "{}")[String(organizationId)] || {};
  } catch {
    return {};
  }
}
export function notificationAvailability(user) {
  const c = notificationConfig(user.organization_id);
  return {
    email: Boolean(c.email?.apiKey && c.email?.from),
    push: Boolean(
      (c.push?.projectId && c.push?.accessToken) || (c.push?.publicKey && c.push?.privateKey && c.push?.subject)
    ),
    whatsapp: Boolean(c.whatsapp?.token && c.whatsapp?.phoneId && c.whatsapp?.template && c.whatsapp?.apiVersion),
    slack: Boolean(c.enterprise && c.slack?.webhook),
    teams: Boolean(c.enterprise && c.teams?.webhook)
  };
}
function windowKey(frequency, now) {
  const date = new Date(now);
  if (frequency === "immediate") return "once";
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `${frequency}:${date.toISOString().slice(0, 10)}`;
}
export function queueNotifications(user, now = new Date().toISOString()) {
  const prefs = getPreferences(user);
  if (prefs.frequency === "off") return { queued: 0 };
  const ids = authorizedBranches(user)
    .map((branch) => branch.id)
    .filter((id) => !prefs.branchIds || prefs.branchIds.includes(id));
  if (!ids.length) return { queued: 0 };
  const rows = db
    .prepare(
      `SELECT id,rule_type FROM alert_incidents WHERE organization_id=? AND status='open' AND branch_id IN (${ids.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 1000`
    )
    .all(user.organization_id, ...ids);
  const available = notificationAvailability(user);
  let queued = 0;
  db.transaction(() => {
    for (const row of rows)
      if (prefs.types.includes(row.rule_type))
        for (const channel of prefs.channels) {
          if (!available[channel]) continue;
          queued += db
            .prepare(
              "INSERT OR IGNORE INTO alert_deliveries(organization_id,alert_id,owner_id,channel,window_key) VALUES (?,?,?,?,?)"
            )
            .run(user.organization_id, row.id, user.owner_id, channel, windowKey(prefs.frequency, now)).changes;
        }
  })();
  return { queued };
}
function trustedWebhook(value, channel) {
  const url = new URL(value);
  const valid =
    channel === "slack"
      ? url.hostname === "hooks.slack.com"
      : url.hostname.endsWith(".logic.azure.com") || url.hostname.endsWith(".environment.api.powerplatform.com");
  if (!valid || url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("invalid_configuration");
  return url.href;
}
export function buildNotificationRequest(channel, config, user, prefs, delivery, snapshot) {
  const title = `Restrova · ${snapshot.severity} · ${snapshot.title}`;
  const text = `${title}\n${snapshot.suggestedAction}\nAlert #${delivery.alert_id}`;
  let url,
    body,
    headers = { "Content-Type": "application/json" };
  if (channel === "email") {
    url = "https://api.resend.com/emails";
    headers.Authorization = `Bearer ${config.email.apiKey}`;
    headers["Idempotency-Key"] = `restrova-alert-${delivery.id}`;
    body = { from: config.email.from, to: [user.email], subject: title, text };
  } else if (channel === "push" && prefs.pushSubscription) {
    if (!isTrustedPushEndpoint(prefs.pushSubscription.endpoint)) throw new Error("invalid_subscription");
    const details = webpush.generateRequestDetails(
      prefs.pushSubscription,
      JSON.stringify({ title, body: snapshot.suggestedAction, alertId: String(delivery.alert_id) }),
      {
        vapidDetails: {
          subject: config.push.subject,
          publicKey: config.push.publicKey,
          privateKey: config.push.privateKey
        },
        TTL: 3600,
        topic: `alert-${delivery.alert_id}`
      }
    );
    return {
      url: details.endpoint,
      options: {
        method: details.method,
        headers: details.headers,
        body: details.body,
        redirect: "error",
        signal: AbortSignal.timeout(10000)
      }
    };
  } else if (channel === "push") {
    if (!/^[a-z0-9-]+$/.test(config.push.projectId)) throw new Error("invalid_configuration");
    url = `https://fcm.googleapis.com/v1/projects/${config.push.projectId}/messages:send`;
    headers.Authorization = `Bearer ${config.push.accessToken}`;
    body = {
      message: {
        token: prefs.pushToken,
        notification: { title, body: snapshot.suggestedAction },
        data: { alertId: String(delivery.alert_id) }
      }
    };
  } else if (channel === "whatsapp") {
    if (!prefs.whatsappConsent || !/^\+[1-9]\d{7,14}$/.test(prefs.whatsappPhone)) throw new Error("consent_required");
    if (!/^v\d+\.\d+$/.test(config.whatsapp.apiVersion) || !/^\d+$/.test(config.whatsapp.phoneId))
      throw new Error("invalid_configuration");
    url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneId}/messages`;
    headers.Authorization = `Bearer ${config.whatsapp.token}`;
    body = {
      messaging_product: "whatsapp",
      to: prefs.whatsappPhone.slice(1),
      type: "template",
      template: {
        name: config.whatsapp.template,
        language: { code: config.whatsapp.language || "ar" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: String(delivery.alert_id) },
              { type: "text", text: snapshot.title }
            ]
          }
        ]
      }
    };
  } else if (["slack", "teams"].includes(channel) && config.enterprise) {
    url = trustedWebhook(config[channel].webhook, channel);
    body =
      channel === "slack"
        ? { text, mrkdwn: false, unfurl_links: false, unfurl_media: false }
        : {
            type: "message",
            attachments: [
              {
                contentType: "application/vnd.microsoft.card.adaptive",
                contentUrl: null,
                content: {
                  type: "AdaptiveCard",
                  version: "1.2",
                  body: [
                    { type: "TextBlock", text: title, wrap: true },
                    { type: "TextBlock", text: snapshot.suggestedAction, wrap: true }
                  ]
                }
              }
            ]
          };
  } else throw new Error("channel_unavailable");
  return {
    url,
    options: {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(10000)
    }
  };
}

// Bounded, durable outbox. Recheck current membership and consent before every attempt.
export async function dispatchNotifications(
  organizationId,
  { transport = fetch, now = new Date().toISOString(), limit = 50 } = {}
) {
  const stale = new Date(Date.parse(now) - 5 * 60000).toISOString();
  db.prepare(
    "UPDATE alert_deliveries SET status='failed',error_code='attempts_exhausted',locked_at=NULL WHERE organization_id=? AND status='sending' AND julianday(locked_at)<julianday(?) AND attempts>=5"
  ).run(organizationId, stale);
  db.prepare(
    "UPDATE alert_deliveries SET status='pending',locked_at=NULL WHERE organization_id=? AND status='sending' AND julianday(locked_at)<julianday(?) AND attempts<5"
  ).run(organizationId, stale);
  const rows = db
    .prepare(
      "SELECT * FROM alert_deliveries WHERE organization_id=? AND status='pending' AND julianday(next_attempt_at)<=julianday(?) AND attempts<5 ORDER BY id LIMIT ?"
    )
    .all(organizationId, now, Math.min(limit, 100));
  const result = { sent: 0, failed: 0, cancelled: 0 };
  for (const row of rows) {
    const claim = db
      .prepare(
        "UPDATE alert_deliveries SET status='sending',locked_at=?,attempts=attempts+1 WHERE id=? AND status='pending'"
      )
      .run(now, row.id);
    if (!claim.changes) continue;
    const alert = db
      .prepare("SELECT * FROM alert_incidents WHERE organization_id=? AND id=?")
      .get(organizationId, row.alert_id);
    const member = db
      .prepare("SELECT role,branch_id FROM organization_users WHERE organization_id=? AND owner_id=?")
      .get(organizationId, row.owner_id);
    const user = member && alert ? getAuthContext(row.owner_id, organizationId, alert.restaurant_id) : null;
    let allowed = Boolean(
      user && alert.status === "open" && (member.role !== "branch_manager" || member.branch_id === alert.branch_id)
    );
    const prefs = user ? getPreferences(user) : null;
    allowed =
      allowed &&
      prefs.frequency !== "off" &&
      prefs.channels.includes(row.channel) &&
      prefs.types.includes(alert.rule_type) &&
      (!prefs.branchIds || prefs.branchIds.includes(alert.branch_id)) &&
      (row.channel !== "whatsapp" || prefs.whatsappConsent);
    if (!allowed) {
      db.prepare(
        "UPDATE alert_deliveries SET status='cancelled',error_code='access_or_preference_changed',locked_at=NULL WHERE id=?"
      ).run(row.id);
      result.cancelled++;
      continue;
    }
    try {
      const request = buildNotificationRequest(
        row.channel,
        notificationConfig(organizationId),
        user,
        prefs,
        row,
        JSON.parse(alert.snapshot_json)
      );
      const response = await transport(request.url, request.options);
      // Provider acceptance is not proof of device delivery. Do not retain response bodies or secrets.
      await response.body?.cancel();
      if (!response.ok) {
        const error = new Error(`provider_${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      db.prepare("UPDATE alert_deliveries SET status='sent',sent_at=?,locked_at=NULL,error_code=NULL WHERE id=?").run(
        now,
        row.id
      );
      result.sent++;
    } catch (error) {
      const retryable = error.retryable || ["TimeoutError", "AbortError", "TypeError"].includes(error.name);
      const retry = retryable && row.attempts + 1 < 5;
      const code = /^provider_\d{3}$/.test(error.message) ? error.message : "delivery_failed";
      db.prepare("UPDATE alert_deliveries SET status=?,next_attempt_at=?,locked_at=NULL,error_code=? WHERE id=?").run(
        retry ? "pending" : "failed",
        new Date(Date.parse(now) + 60000 * 2 ** row.attempts).toISOString(),
        code,
        row.id
      );
      result.failed++;
    }
  }
  return result;
}
export function deliveryStatus(user) {
  return {
    available: notificationAvailability(user),
    publicPushKey: notificationAvailability(user).push
      ? notificationConfig(user.organization_id).push?.publicKey || null
      : null,
    counts: db
      .prepare(
        "SELECT status,COUNT(*) AS count FROM alert_deliveries WHERE organization_id=? AND owner_id=? GROUP BY status"
      )
      .all(user.organization_id, user.owner_id),
    channels
  };
}
