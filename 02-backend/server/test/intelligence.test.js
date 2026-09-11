import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, branch, sale, ledger, roleToken, db } from "../test-support/operationsFixtures.js";
import { dayOffset } from "../src/services/historicalSeriesService.js";
import { severityFor } from "../src/services/anomalyService.js";
import { getAuthContext } from "../src/repositories/authRepository.js";
import {
  buildNotificationRequest,
  dispatchNotifications,
  queueNotifications
} from "../src/services/alertNotificationService.js";
const anchor = "2026-08-24T12:00:00Z";
async function fixture(t, { outlier = false, drop = false } = {}) {
  const server = start(t),
    owner = await account(server),
    id = await branch(server, owner, "Intelligence Branch");
  for (let offset = -57; offset < 0; offset++) {
    const date = dayOffset("2026-08-24", offset),
      gross = outlier && offset === -1 ? 40000 : drop && offset >= -7 ? 7000 : 10000;
    sale(owner, id, `${date}T12:00:00+03:00`, { gross });
    ledger(owner, id, `${date}T12:00:00+03:00`, {
      sales: gross,
      food_costs: 1000,
      packaging: 200,
      delivery_commissions: 300,
      labor: 400,
      rent: 100,
      utilities: 100,
      marketing: 50,
      miscellaneous_operating_expenses: 50
    });
  }
  const query = `scope=branch&branchId=${id}&anchor=${anchor}`;
  return {
    server,
    owner,
    id,
    query,
    user: getAuthContext(owner.user.id, owner.organization.id, owner.restaurant.id),
    get: (path) => request(server, path, { token: owner.token })
  };
}
test("#48–49 weekly robust baseline excludes the target and incomplete day; severity is reproducible", async (t) => {
  const { get, query, owner, id } = await fixture(t, { outlier: true });
  const response = await get(`/alerts/anomalies?${query}`);
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  const result = response.payload;
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].baselineMedianMinor, 10000);
  assert.equal(result.alerts[0].lowerMinor, 9000);
  assert.equal(result.alerts[0].upperMinor, 11000);
  assert.equal(result.alerts[0].severity, "CRITICAL");
  assert.equal(result.alerts[0].evidence.baseline.length, 8);
  assert.ok(result.alerts[0].evidence.baseline.every((day) => day.date !== "2026-08-23"));
  sale(owner, id, "2026-08-24T01:00:00+03:00", { gross: 900000 });
  assert.deepEqual((await get(`/alerts/anomalies?${query}`)).payload, result);
  const zh = (await get(`/alerts/anomalies?${query}&language=zh`)).payload;
  assert.match(zh.alerts[0].title, /销售/);
  assert.equal(severityFor({ status: "insufficient_data" }).severity, "INFO");
  assert.equal(
    severityFor({ status: "triggered", type: "sales_drop", measuredBps: 1500, thresholdBps: 1000 }).severity,
    "WARNING"
  );
  assert.equal(
    severityFor({ status: "triggered", type: "sales_drop", measuredBps: 2000, thresholdBps: 1000 }).severity,
    "CRITICAL"
  );
  db.prepare("DELETE FROM sales_lines WHERE branch_id=? AND created_at<?").run(id, "2026-08-10");
  assert.equal((await get(`/alerts/anomalies?${query}`)).payload.evaluations[0].status, "insufficient_data");
});
test("#54–57 tomorrow, 7 and 30 day forecasts reconcile sales, four cost groups and three profit measures", async (t) => {
  const { get, query } = await fixture(t);
  for (const horizon of [1, 7, 30]) {
    const response = await get(`/forecasts?${query}&horizon=${horizon}`);
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    const data = response.payload;
    assert.equal(data.daily.length, horizon);
    assert.equal(data.daily[0].date, "2026-08-25");
    assert.equal(data.totals.revenueMinor, 10000 * horizon);
    assert.equal(data.totals.foodCostsMinor, 1000 * horizon);
    assert.equal(data.totals.packagingMinor, 200 * horizon);
    assert.equal(data.totals.commissionsMinor, 300 * horizon);
    assert.equal(data.totals.operatingCostsMinor, 700 * horizon);
    assert.equal(data.totals.grossProfitMinor, 9000 * horizon);
    assert.equal(data.totals.contributionProfitMinor, 8500 * horizon);
    assert.equal(data.totals.netProfitMinor, 7800 * horizon);
    assert.equal(data.branches[0].evidence.history.length, 57);
    assert.ok(data.branches[0].evidence.history[0].ledgerLineage.length);
    assert.deepEqual(data, (await get(`/forecasts?${query}&horizon=${horizon}`)).payload);
  }
});
test("forecast missing categories, unmatched sources, missing branches and unallocated costs stay explicit", async (t) => {
  const { get, query, id, owner } = await fixture(t);
  const group = await get(`/forecasts?scope=organization&anchor=${anchor}`);
  assert.equal(group.payload.totals.revenueMinor, null); // Initial branch has unknown lifecycle/no data.
  db.prepare("DELETE FROM financial_ledger_entries WHERE branch_id=? AND category='packaging'").run(id);
  let result = (await get(`/forecasts?${query}`)).payload;
  assert.equal(result.totals.revenueMinor, 70000);
  assert.equal(result.totals.netProfitMinor, null);
  assert.ok(result.branches[0].evidence.missingCategories.includes("packaging"));
  db.prepare(
    "UPDATE financial_ledger_entries SET amount_minor=amount_minor+1 WHERE branch_id=? AND category='sales'"
  ).run(id);
  result = (await get(`/forecasts?${query}`)).payload;
  assert.equal(result.branches[0].evidence.costHistoryComplete, false);
  db.prepare("DELETE FROM sales_lines WHERE branch_id=?").run(id);
  result = (await get(`/forecasts?${query}`)).payload;
  assert.equal(result.totals.revenueMinor, null);
  assert.ok(owner.user.id);
});
test("#50,52,53 preferences, incident refresh, resolution, assignment, comments and conflicts are durable", async (t) => {
  const { server, owner, id, get, user } = await fixture(t, { drop: true });
  const prefs = (await get("/alerts/preferences")).payload;
  assert.equal(prefs.frequency, "off");
  let response = await request(server, "/alerts/preferences", {
    token: owner.token,
    method: "PUT",
    body: { ...prefs, branchIds: [id], language: "en" }
  });
  assert.equal(response.status, 200);
  const refresh = () =>
    request(server, "/alerts/refresh", {
      token: owner.token,
      method: "POST",
      body: { scope: "branch", branchId: id, anchor }
    });
  const first = await refresh();
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  assert.ok(first.payload.created > 0);
  assert.equal((await refresh()).payload.created, 0);
  const list = (await get(`/alerts?scope=branch&branchId=${id}`)).payload;
  const item = list.items[0];
  assert.ok(item.snapshot.evidence);
  assert.equal(item.status, "open");
  let version = item.version;
  for (const body of [
    { action: "comment", comment: "راجع الخصومات / 检查" },
    { action: "assign", assignedTo: owner.user.id },
    { action: "resolve" },
    { action: "reopen" }
  ]) {
    response = await request(server, `/alerts/${item.id}`, {
      token: owner.token,
      method: "PATCH",
      body: { version, ...body }
    });
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    version = response.payload.version;
  }
  response = await request(server, `/alerts/${item.id}`, {
    token: owner.token,
    method: "PATCH",
    body: { version: 1, action: "resolve" }
  });
  assert.equal(response.status, 409);
  const history = (await get(`/alerts/${item.id}/history`)).payload;
  assert.equal(history.events.length, 5);
  assert.equal(history.version, 5);
  assert.ok(history.assignees.some((person) => person.id === owner.user.id));
  assert.equal(
    db.prepare("SELECT assigned_to FROM alert_incidents WHERE id=?").get(item.id).assigned_to,
    user.owner_id
  );
  const disabled = await request(server, "/alerts/preferences", {
    token: owner.token,
    method: "PUT",
    body: { ...prefs, types: [], branchIds: [id] }
  });
  assert.equal(disabled.status, 200);
  assert.equal((await refresh()).payload.created, 0);
});
test("all intelligence endpoints enforce tenant/restaurant/branch roles, invalid filters and consent", async (t) => {
  const { server, owner, id, query, get } = await fixture(t, { drop: true });
  const other = await account(server);
  for (const path of [`/forecasts?${query}`, `/alerts/anomalies?${query}`, `/alerts?scope=branch&branchId=${id}`]) {
    assert.equal((await request(server, path)).status, 401);
    assert.equal((await request(server, path, { token: other.token })).status, 404);
  }
  const viewer = roleToken(owner, "viewer"),
    manager = roleToken(owner, "branch_manager", id);
  assert.equal((await request(server, `/forecasts?${query}`, { token: viewer })).status, 200);
  assert.equal((await request(server, "/forecasts?scope=organization", { token: viewer })).status, 403);
  assert.equal((await request(server, "/alerts/refresh", { token: viewer, method: "POST", body: {} })).status, 403);
  assert.equal(
    (await request(server, `/forecasts?scope=branch&branchId=${owner.branches[0].id}`, { token: manager })).status,
    404
  );
  for (const path of [
    "/forecasts?horizon=2",
    "/forecasts?historyDays=1000",
    "/alerts/anomalies?historyDays=0",
    "/forecasts?anchor=bad",
    "/forecasts?unexpected=1"
  ])
    assert.equal((await get(path)).status, 400, path);
  const prefs = (await get("/alerts/preferences")).payload;
  assert.equal(
    (
      await request(server, "/alerts/preferences", {
        token: owner.token,
        method: "PUT",
        body: { ...prefs, branchIds: [other.branches[0].id] }
      })
    ).status,
    404
  );
  assert.equal(
    (
      await request(server, "/alerts/preferences", {
        token: owner.token,
        method: "PUT",
        body: { ...prefs, channels: ["whatsapp"], whatsappPhone: "+966500000000", whatsappConsent: false }
      })
    ).status,
    400
  );
  await request(server, "/alerts/refresh", {
    token: owner.token,
    method: "POST",
    body: { scope: "branch", branchId: id, anchor }
  });
  const item = (await get(`/alerts?scope=branch&branchId=${id}`)).payload.items[0];
  assert.equal((await request(server, `/alerts/${item.id}/history`, { token: other.token })).status, 404);
  assert.equal(
    (
      await request(server, `/alerts/${item.id}`, {
        token: viewer,
        method: "PATCH",
        body: { version: 1, action: "resolve" }
      })
    ).status,
    403
  );
});
test("#51 provider adapters, durable deduplication, retries, consent and revoked access do not send real messages", async (t) => {
  const { server, owner, id, user, get } = await fixture(t, { drop: true });
  const config = {
    email: { apiKey: "test-key", from: "alerts@example.test" },
    push: { projectId: "test-project", accessToken: "test-token" },
    whatsapp: { apiVersion: "v99.0", phoneId: "123", token: "test-token", template: "approved_alert" },
    enterprise: true,
    slack: { webhook: "https://hooks.slack.com/services/test" },
    teams: { webhook: "https://example.logic.azure.com/workflow" }
  };
  process.env.ALERT_NOTIFICATION_CONFIG = JSON.stringify({ [owner.organization.id]: config });
  t.after(() => delete process.env.ALERT_NOTIFICATION_CONFIG);
  const prefs = {
    ...(await get("/alerts/preferences")).payload,
    branchIds: [id],
    frequency: "immediate",
    channels: ["email"],
    pushToken: "device",
    whatsappPhone: "+966500000000",
    whatsappConsent: true
  };
  await request(server, "/alerts/preferences", { token: owner.token, method: "PUT", body: prefs });
  await request(server, "/alerts/refresh", {
    token: owner.token,
    method: "POST",
    body: { scope: "branch", branchId: id, anchor }
  });
  const queued = queueNotifications(user);
  assert.ok(queued.queued > 0);
  assert.equal(queueNotifications(user).queued, 0);
  let calls = 0;
  const retry = await dispatchNotifications(owner.organization.id, {
    transport: async () => {
      calls++;
      return { ok: false, status: 429 };
    }
  });
  assert.ok(retry.failed > 0);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM alert_deliveries WHERE organization_id=? AND status='pending'")
      .get(owner.organization.id).n,
    queued.queued
  );
  const sent = await dispatchNotifications(owner.organization.id, {
    now: new Date(Date.now() + 120000).toISOString(),
    transport: async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(options.body).to, [owner.user.email]);
      return { ok: true };
    }
  });
  assert.equal(sent.sent, queued.queued);
  assert.equal(
    (
      await dispatchNotifications(owner.organization.id, {
        transport: async () => {
          throw Error("must not resend");
        }
      })
    ).sent,
    0
  );
  const snapshot = { title: "Alert", severity: "WARNING", suggestedAction: "Review" };
  for (const channel of ["email", "push", "whatsapp", "slack", "teams"]) {
    const request = buildNotificationRequest(channel, config, user, prefs, { id: 1, alert_id: 1 }, snapshot);
    assert.ok(request.url.startsWith("https://"));
    assert.ok(JSON.parse(request.options.body));
  }
  assert.throws(
    () =>
      buildNotificationRequest(
        "whatsapp",
        config,
        user,
        { ...prefs, whatsappConsent: false },
        { id: 1, alert_id: 1 },
        snapshot
      ),
    /consent/
  );
  assert.throws(() =>
    buildNotificationRequest(
      "slack",
      { ...config, slack: { webhook: "http://127.0.0.1/" } },
      user,
      prefs,
      { id: 1, alert_id: 1 },
      snapshot
    )
  );
  await request(server, "/alerts/preferences", {
    token: owner.token,
    method: "PUT",
    body: { ...prefs, frequency: "daily" }
  });
  assert.ok(queueNotifications(user).queued > 0);
  db.prepare("DELETE FROM organization_users WHERE organization_id=? AND owner_id=?").run(
    owner.organization.id,
    owner.user.id
  );
  const cancelled = await dispatchNotifications(owner.organization.id, {
    transport: async () => {
      throw Error("must not send after revocation");
    }
  });
  assert.ok(cancelled.cancelled > 0);
  assert.ok(calls > 0);
});

test("group projections reconcile branches and refuse profit totals when costs are unallocated", async (t) => {
  const { owner, get } = await fixture(t);
  const main = owner.branches[0].id;
  db.prepare("INSERT INTO branch_lifecycle(branch_id,opened_on,updated_by) VALUES (?,'2025-01-01',?)").run(
    main,
    owner.user.id
  );
  for (let offset = -57; offset < 0; offset++) {
    const date = `${dayOffset("2026-08-24", offset)}T12:00:00+03:00`;
    sale(owner, main, date, { gross: 10000 });
    ledger(owner, main, date, {
      sales: 10000,
      food_costs: 1000,
      packaging: 200,
      delivery_commissions: 300,
      labor: 400,
      rent: 100,
      utilities: 100,
      marketing: 50,
      miscellaneous_operating_expenses: 50
    });
  }
  let result = (await get(`/forecasts?scope=organization&anchor=${anchor}`)).payload;
  assert.equal(result.totals.revenueMinor, 140000);
  assert.equal(result.totals.netProfitMinor, 109200);
  ledger(owner, null, "2026-08-23T12:00:00+03:00", { rent: 10000 });
  result = (await get(`/forecasts?scope=organization&anchor=${anchor}`)).payload;
  assert.equal(result.hasUnallocatedLedger, true);
  assert.equal(result.totals.revenueMinor, 140000);
  assert.equal(result.totals.netProfitMinor, null);
});
test("recurrence counts subsequent observed dates, not repeated evaluations or threshold edits", async (t) => {
  const { owner, server, id, get } = await fixture(t, { drop: true });
  const refresh = (at) =>
    request(server, "/alerts/refresh", {
      token: owner.token,
      method: "POST",
      body: { scope: "branch", branchId: id, anchor: at }
    });
  await refresh(anchor);
  const first = (await get(`/alerts?scope=branch&branchId=${id}`)).payload.items.find(
    (item) => item.snapshot.type === "sales_drop"
  );
  assert.equal(first.recurrenceCount, 0);
  sale(owner, id, "2026-08-24T12:00:00+03:00", { gross: 7000 });
  ledger(owner, id, "2026-08-24T12:00:00+03:00", { sales: 7000, food_costs: 1000 });
  await refresh("2026-08-25T12:00:00Z");
  const latest = (await get(`/alerts?scope=branch&branchId=${id}`)).payload.items.find(
    (item) => item.snapshot.type === "sales_drop"
  );
  assert.equal(latest.recurrenceCount, 1);
  const prefs = (await get("/alerts/preferences")).payload;
  await request(server, "/alerts/preferences", {
    token: owner.token,
    method: "PUT",
    body: { ...prefs, thresholds: { ...prefs.thresholds, salesDropBps: 1100 } }
  });
  await refresh("2026-08-25T12:00:00Z");
  const adjusted = (await get(`/alerts?scope=branch&branchId=${id}`)).payload.items.find(
    (item) => item.snapshot.type === "sales_drop"
  );
  assert.equal(adjusted.recurrenceCount, 1);
});
test("outbox is bounded, exhausts retries, recovers stale claims and cancels resolved alerts", async (t) => {
  const { owner, server, id, user, get } = await fixture(t, { drop: true });
  process.env.ALERT_NOTIFICATION_CONFIG = JSON.stringify({
    [owner.organization.id]: { email: { apiKey: "test-key", from: "alerts@example.test" } }
  });
  t.after(() => delete process.env.ALERT_NOTIFICATION_CONFIG);
  const prefs = (await get("/alerts/preferences")).payload;
  await request(server, "/alerts/preferences", {
    token: owner.token,
    method: "PUT",
    body: { ...prefs, frequency: "immediate", channels: ["email"] }
  });
  await request(server, "/alerts/refresh", {
    token: owner.token,
    method: "POST",
    body: { scope: "branch", branchId: id, anchor }
  });
  queueNotifications(user);
  const row = db.prepare("SELECT * FROM alert_deliveries WHERE organization_id=? LIMIT 1").get(owner.organization.id);
  db.prepare("UPDATE alert_deliveries SET attempts=4 WHERE id=?").run(row.id);
  await dispatchNotifications(owner.organization.id, { transport: async () => ({ ok: false, status: 503 }) });
  assert.equal(db.prepare("SELECT status FROM alert_deliveries WHERE id=?").get(row.id).status, "failed");
  db.prepare("UPDATE alert_deliveries SET status='sending',locked_at='2020-01-01T00:00:00Z',attempts=5 WHERE id=?").run(
    row.id
  );
  await dispatchNotifications(owner.organization.id, { transport: async () => ({ ok: true }) });
  assert.equal(db.prepare("SELECT status FROM alert_deliveries WHERE id=?").get(row.id).status, "failed");
  db.prepare("UPDATE alert_deliveries SET status='pending',attempts=0,next_attempt_at='2020-01-01' WHERE id=?").run(
    row.id
  );
  db.prepare("UPDATE alert_incidents SET status='resolved' WHERE id=?").run(row.alert_id);
  const result = await dispatchNotifications(owner.organization.id, {
    transport: async () => {
      throw Error("no resolved notifications");
    }
  });
  assert.ok(result.cancelled > 0);
});

test("native browser push encrypts a validated subscription and keeps private VAPID keys server-side", async (t) => {
  const { default: webpush } = await import("web-push");
  const { createECDH, randomBytes } = await import("node:crypto");
  const { server, owner, user, get } = await fixture(t);
  const vapid = webpush.generateVAPIDKeys(),
    ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    expirationTime: null,
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") }
  };
  const config = { push: { ...vapid, subject: "mailto:alerts@example.test" } };
  process.env.ALERT_NOTIFICATION_CONFIG = JSON.stringify({ [owner.organization.id]: config });
  t.after(() => delete process.env.ALERT_NOTIFICATION_CONFIG);
  const prefs = { ...(await get("/alerts/preferences")).payload, pushSubscription: subscription, channels: ["push"] };
  assert.equal(
    (await request(server, "/alerts/preferences", { token: owner.token, method: "PUT", body: prefs })).status,
    200
  );
  const status = (await get("/alerts/notifications")).payload;
  assert.equal(status.available.push, true);
  assert.equal(status.publicPushKey, vapid.publicKey);
  assert.ok(!JSON.stringify(status).includes(vapid.privateKey));
  const details = buildNotificationRequest(
    "push",
    config,
    user,
    prefs,
    { id: 1, alert_id: 1 },
    { title: "Test", severity: "WARNING", suggestedAction: "Review" }
  );
  assert.ok(Buffer.isBuffer(details.options.body));
  assert.equal(details.options.headers["Content-Encoding"], "aes128gcm");
  assert.equal(details.options.redirect, "error");
  assert.ok(!details.options.body.toString().includes("Review"));
  assert.equal(
    (
      await request(server, "/alerts/preferences", {
        token: owner.token,
        method: "PUT",
        body: { ...prefs, pushSubscription: { ...subscription, endpoint: "https://127.0.0.1/private" } }
      })
    ).status,
    400
  );
});
