import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");

async function request(server, path, { token, method = "GET", body } = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

async function registerOrg(server, overrides = {}) {
  const unique = `${stamp}-${Math.floor(Math.random() * 100000)}`;
  const body = {
    name: "Phase2 Owner",
    email: `p2-${unique}@example.test`,
    password: "demo12345",
    organizationName: `Org ${unique}`,
    restaurantName: `Restaurant ${unique}`,
    branchName: "Main Branch",
    branchCode: `MB-${unique.slice(-6)}`,
    city: "Aden",
    currency: "YER",
    timezone: "Asia/Aden",
    ...overrides
  };
  const registered = await request(server, "/api/auth/register", { method: "POST", body });
  assert.equal(registered.status, 201, `registration failed: ${JSON.stringify(registered.payload)}`);
  return registered.payload;
}

test("H1: AI answers use the organization currency, not hardcoded CNY", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const session = await registerOrg(server, { currency: "USD", timezone: "Asia/Aden" });

  const dashboard = await request(server, "/api/dashboard", { token: session.token });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.payload.currency, "USD");

  const chat = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "كم أرباح هذا الأسبوع؟" }
  });
  assert.equal(chat.status, 200);
  const content = chat.payload.message.content;
  assert.match(content, /\$/);
  assert.doesNotMatch(content, /CN¥|CNY|¥/);

  const daily = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "كيف أداء المطعم اليوم؟" }
  });
  assert.match(daily.payload.message.content, /\$/);
  assert.doesNotMatch(daily.payload.message.content, /CN¥|CNY|¥/);

  // YER (non-symbol currency) renders with its ISO code.
  const yerSession = await registerOrg(server, { currency: "YER" });
  const yerChat = await request(server, "/api/chat", {
    token: yerSession.token,
    method: "POST",
    body: { message: "كم أرباح هذا الأسبوع؟" }
  });
  assert.match(yerChat.payload.message.content, /YER/);
  assert.doesNotMatch(yerChat.payload.message.content, /CN¥|¥/);
});

test("H2: operating day, peak hour and ranges use the organization timezone (Asia/Aden)", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const session = await registerOrg(server); // Asia/Aden, operating 00:00-23:59 from register default? branch from register flow
  const restaurantId = session.restaurant.id;
  const branchId = session.branches[0].id;
  db.prepare("UPDATE branches SET operating_day_start='10:00', operating_day_end='02:00' WHERE id=?").run(branchId);

  // Order at 13:00 UTC on 2026-01-10 = 16:00 Asia/Aden (same calendar day).
  db.prepare(
    "INSERT INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at,source_key) VALUES (?,?,?,?,?,?,?)"
  ).run(
    restaurantId,
    branchId,
    JSON.stringify([{ name: "Mandi", quantity: 1, price: 500, cost: 200 }]),
    500,
    200,
    "2026-01-10T13:00:00.000Z",
    `p2-htz-a-${stamp}`
  );
  // Order at 2026-01-10 22:00Z = 2026-01-11 01:00 Asia/Aden → inside the Jan
  // 10 operating day because the day ends at 02:00 (+1 day). A UTC-literal
  // reading would wrongly exclude this order.
  db.prepare(
    "INSERT INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at,source_key) VALUES (?,?,?,?,?,?,?)"
  ).run(
    restaurantId,
    branchId,
    JSON.stringify([{ name: "Mandi", quantity: 1, price: 300, cost: 100 }]),
    300,
    100,
    "2026-01-10T22:00:00.000Z",
    `p2-htz-b-${stamp}`
  );

  const tools = await import("../src/tools.js");
  const scope = { restaurantId, branchId, timezone: "Asia/Aden", currency: "YER", role: "owner" };
  const sales = tools.executeTool("get_daily_sales", { date: "2026-01-10" }, scope);
  // Operating window for Asia/Aden 10:00→02:00(+1): 07:00Z → 23:00Z
  assert.equal(sales.operating_window.start, "2026-01-10T07:00:00.000Z");
  assert.equal(sales.operating_window.end, "2026-01-10T23:00:00.000Z");
  assert.equal(sales.timezone, "Asia/Aden");
  assert.equal(sales.orders, 2);
  assert.equal(sales.revenue, 800);
  // 13:00Z = 16:00 Aden; 00:30Z next day = 03:30 Aden → peak is 16:00-17:00.
  assert.equal(sales.peak_hour, "16:00-17:00");

  // get_profit_summary "today" uses the same operating-day definition as
  // get_daily_sales: an order placed at the midpoint of the current operating
  // window must be counted by BOTH tools or excluded by BOTH.
  const before = tools.executeTool("get_daily_sales", {}, scope);
  const mid = new Date(
    (new Date(before.operating_window.start).getTime() + new Date(before.operating_window.end).getTime()) / 2
  ).toISOString();
  db.prepare(
    "INSERT INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at,source_key) VALUES (?,?,?,?,?,?,?)"
  ).run(
    restaurantId,
    branchId,
    JSON.stringify([{ name: "Dish", quantity: 1, price: 77, cost: 20 }]),
    77,
    20,
    mid,
    `p2-htz-mid-${stamp}`
  );
  const dailyToday = tools.executeTool("get_daily_sales", {}, scope);
  const summaryToday = tools.executeTool("get_profit_summary", { range: "today" }, scope);
  assert.equal(dailyToday.date, tools.localDay(scope));
  assert.equal(dailyToday.orders, before.orders + 1);
  assert.equal(summaryToday.orders, dailyToday.orders, "daily sales and profit 'today' must agree");
  assert.equal(summaryToday.revenue, dailyToday.revenue);

  // New_York DST sanity: no fixed-offset assumption anywhere.
  assert.equal(tools.isoDayInTz("America/New_York", new Date("2026-07-01T02:30:00Z")), "2026-06-30");
  assert.equal(tools.hourInTz("2026-07-01T02:30:00Z", "America/New_York"), 22);
  assert.equal(tools.isoDayInTz("Asia/Shanghai", new Date("2026-07-01T18:00:00Z")), "2026-07-02");
});

test("C1: executive action requires owner approval; confirm executes once; replay and cancel are enforced", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const session = await registerOrg(server);
  const restaurantId = session.restaurant.id;

  // Seed one menu item.
  const itemId = Number(
    db
      .prepare("INSERT INTO menu_items(restaurant_id,name,price,cost,active) VALUES (?,?,?,?,1)")
      .run(restaurantId, "Mandi Rice", 40, 15).lastInsertRowid
  );

  // 1) The AI proposes the action but does NOT execute it.
  const proposal = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "please deactivate Mandi Rice dish" }
  });
  assert.equal(proposal.status, 200);
  const pending = proposal.payload.message.pendingAction;
  assert.ok(pending, "response should include a pendingAction card payload");
  assert.equal(pending.tool, "flag_menu_item");
  assert.equal(pending.arguments.item_id, itemId);
  assert.equal(pending.arguments.action, "deactivate");
  assert.equal(pending.status, "pending");
  assert.equal(
    db.prepare("SELECT active FROM menu_items WHERE id=?").get(itemId).active,
    1,
    "item must not change before approval"
  );

  // 2) Confirm executes the action exactly once.
  const confirmed = await request(server, `/api/actions/${pending.hash}/confirm`, {
    token: session.token,
    method: "POST"
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payload.executed, true);
  assert.equal(db.prepare("SELECT active FROM menu_items WHERE id=?").get(itemId).active, 0);

  // 3) Replaying the same confirmation is rejected.
  const replay = await request(server, `/api/actions/${pending.hash}/confirm`, {
    token: session.token,
    method: "POST"
  });
  assert.equal(replay.status, 404);

  // 4) Cancel flow: proposal → cancel → confirm is impossible.
  const reportProposal = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "أنشئ تقرير أسبوعي" }
  });
  assert.equal(reportProposal.status, 200);
  const reportPending = reportProposal.payload.message.pendingAction;
  assert.ok(reportPending);
  assert.equal(reportPending.tool, "create_report");
  const reportsBefore = db.prepare("SELECT count(*) n FROM reports WHERE restaurant_id=?").get(restaurantId).n;
  assert.equal(reportsBefore, 0, "report must not exist before approval");

  const cancelled = await request(server, `/api/actions/${reportPending.hash}/cancel`, {
    token: session.token,
    method: "POST"
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.cancelled, true);

  const confirmAfterCancel = await request(server, `/api/actions/${reportPending.hash}/confirm`, {
    token: session.token,
    method: "POST"
  });
  assert.equal(confirmAfterCancel.status, 404);
  assert.equal(db.prepare("SELECT count(*) n FROM reports WHERE restaurant_id=?").get(restaurantId).n, 0);

  // 5) Confirmed report creation actually creates the report.
  const proposal2 = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "create a monthly report" }
  });
  const pending2 = proposal2.payload.message.pendingAction;
  assert.equal(pending2.tool, "create_report");
  assert.equal(pending2.arguments.date_range, "month");
  const confirmedReport = await request(server, `/api/actions/${pending2.hash}/confirm`, {
    token: session.token,
    method: "POST"
  });
  assert.equal(confirmedReport.status, 200);
  assert.equal(confirmedReport.payload.result.report_id > 0, true);
  assert.equal(db.prepare("SELECT count(*) n FROM reports WHERE restaurant_id=?").get(restaurantId).n, 1);

  // 6) Non-owner accounts never receive an executable pending action.
  const invite = await request(server, "/api/users/invite", {
    token: session.token,
    method: "POST",
    body: { email: `viewer-${stamp}@example.test`, role: "viewer" }
  });
  assert.equal(invite.status, 201);
  const viewerLogin = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: `viewer-${stamp}@example.test`, password: invite.payload.temporaryPassword }
  });
  assert.equal(viewerLogin.status, 200);
  const viewerChat = await request(server, "/api/chat", {
    token: viewerLogin.payload.token,
    method: "POST",
    body: { message: "please deactivate Mandi Rice dish" }
  });
  assert.equal(viewerChat.status, 200);
  assert.equal(viewerChat.payload.message.pendingAction, undefined);
  assert.match(viewerChat.payload.message.content, /owner/i);
});

test("H4/H7: creating a restaurant provisions a default branch and reissues the session token", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const session = await registerOrg(server);
  const firstRestaurantId = session.restaurant.id;

  const created = await request(server, "/api/restaurants", {
    token: session.token,
    method: "POST",
    body: { name: "Second Restaurant" }
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.ok(created.payload.defaultBranch, "default branch must be created");
  assert.ok(created.payload.token, "a fresh token must be issued");
  assert.equal(created.payload.session.restaurant.id, created.payload.id);
  assert.equal(created.payload.session.branches.length, 1);
  assert.equal(created.payload.session.branches[0].id, created.payload.defaultBranch.id);

  // The new token points at the new restaurant immediately (H7).
  const me = await request(server, "/api/auth/me", { token: created.payload.token });
  assert.equal(me.payload.restaurant.id, created.payload.id);

  // The restaurant list feeds the switcher (H4).
  const list = await request(server, "/api/restaurants", { token: session.token });
  assert.equal(list.status, 200);
  assert.equal(list.payload.length, 2);

  // Switching back to the first restaurant reissues the session.
  const switched = await request(server, "/api/auth/switch-restaurant", {
    token: created.payload.token,
    method: "POST",
    body: { restaurantId: firstRestaurantId }
  });
  assert.equal(switched.status, 200);
  assert.equal(switched.payload.restaurant.id, firstRestaurantId);
  const meBack = await request(server, "/api/auth/me", { token: switched.payload.token });
  assert.equal(meBack.payload.restaurant.id, firstRestaurantId);

  // Switching to a restaurant outside the organization is forbidden.
  const other = await registerOrg(server);
  const cross = await request(server, "/api/auth/switch-restaurant", {
    token: session.token,
    method: "POST",
    body: { restaurantId: other.restaurant.id }
  });
  assert.equal(cross.status, 403);

  const missing = await request(server, "/api/auth/switch-restaurant", {
    token: session.token,
    method: "POST",
    body: { restaurantId: 999999 }
  });
  assert.equal(missing.status, 403);
});

test("branch context: dashboard and chat honor the selected branch and reject foreign branches", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const session = await registerOrg(server);
  const restaurantId = session.restaurant.id;
  const firstBranchId = session.branches[0].id;

  const second = await request(server, "/api/branches", {
    token: session.token,
    method: "POST",
    body: { name: "Branch Two", code: `B2-${stamp.slice(-6)}`, city: "Aden" }
  });
  assert.equal(second.status, 201);
  const secondBranchId = second.payload.id;

  const insertOrder = (branchId, total, key) =>
    db
      .prepare(
        "INSERT INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at,source_key) VALUES (?,?,?,?,?,?,?)"
      )
      .run(
        restaurantId,
        branchId,
        JSON.stringify([{ name: "Dish", quantity: 1, price: total, cost: 1 }]),
        total,
        1,
        new Date().toISOString(),
        key
      );

  insertOrder(firstBranchId, 100, `p2-br1-${stamp}`);
  insertOrder(secondBranchId, 50, `p2-br2-${stamp}`);

  const all = await request(server, "/api/dashboard", { token: session.token });
  assert.equal(all.payload.sales.branch_id, firstBranchId);
  assert.equal(all.payload.sales.revenue, 100);

  const secondView = await request(server, `/api/dashboard?branchId=${secondBranchId}`, { token: session.token });
  assert.equal(secondView.payload.sales.branch_id, secondBranchId);
  assert.equal(secondView.payload.sales.revenue, 50);

  const invalid = await request(server, "/api/dashboard?branchId=999999", { token: session.token });
  assert.equal(invalid.status, 404);

  // A branch from another organization must never be usable.
  const other = await registerOrg(server);
  const otherBranchId = other.branches[0].id;
  const foreign = await request(server, `/api/dashboard?branchId=${otherBranchId}`, { token: session.token });
  assert.equal(foreign.status, 404);

  // Chat is branch-scoped too: the session row and the numbers follow branchId.
  const chatBranch2 = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "How are sales today?", branchId: secondBranchId }
  });
  assert.equal(chatBranch2.status, 200);
  const chatSessionRow = db
    .prepare("SELECT branch_id FROM chat_sessions WHERE id=?")
    .get(chatBranch2.payload.sessionId);
  assert.equal(chatSessionRow.branch_id, secondBranchId);
  assert.match(chatBranch2.payload.message.content, /50/);

  const chatBranch1 = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "How are sales today?", branchId: firstBranchId }
  });
  assert.match(chatBranch1.payload.message.content, /100/);
  assert.doesNotMatch(chatBranch1.payload.message.content, /150/);

  const chatInvalidBranch = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "How are sales today?", branchId: 999999 }
  });
  assert.equal(chatInvalidBranch.status, 404);
});

test("M1: feedback stores correctTools and the training export exposes them", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const session = await registerOrg(server);

  const chat = await request(server, "/api/chat", {
    token: session.token,
    method: "POST",
    body: { message: "How are sales today?" }
  });
  assert.equal(chat.status, 200);
  const messageId = chat.payload.message.id;
  const sessionId = chat.payload.sessionId;

  const feedback = await request(server, "/api/feedback", {
    token: session.token,
    method: "POST",
    body: {
      sessionId,
      messageId,
      rating: "approved",
      correctTools: ["get_daily_sales"]
    }
  });
  assert.equal(feedback.status, 201);

  const row = db.prepare("SELECT correct_tools FROM answer_feedback WHERE message_id=?").get(messageId);
  assert.deepEqual(JSON.parse(row.correct_tools), ["get_daily_sales"]);

  const training = await request(server, "/api/training/export", { token: session.token });
  assert.equal(training.status, 200);
  const entry = training.payload.find((row) => row.question.includes("sales"));
  assert.ok(entry, "exported training should include the feedback row");
  assert.deepEqual(entry.correct_tools, ["get_daily_sales"]);
});

test("M2: unknown API routes return the JSON error contract", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const getUnknown = await request(server, "/api/definitely-not-a-route");
  assert.equal(getUnknown.status, 404);
  assert.equal(getUnknown.payload.code, "RESOURCE_NOT_FOUND");
  assert.equal(typeof getUnknown.payload.error, "string");

  const postUnknown = await request(server, "/api/also-not-a-route", { method: "POST", body: {} });
  assert.equal(postUnknown.status, 404);
  assert.equal(postUnknown.payload.code, "RESOURCE_NOT_FOUND");
});

test("regression: phase 1 email case-insensitive login still works", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const email = `Mixed.Case-${stamp}@Example.COM`;
  const session = await registerOrg(server, { email });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: email.toLowerCase(), password: "demo12345" }
  });
  assert.equal(login.status, 200);
});
