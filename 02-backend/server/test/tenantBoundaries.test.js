import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { register, login, authenticateBearerHeader } = await import("../src/services/authService.js");
const { exportTrainingFeedback } = await import("../src/services/chatService.js");
const chatRepository = await import("../src/repositories/chatRepository.js");
const { createConnector, previewConnector } = await import("../src/services/integrationService.js");

async function request(server, path, { token, method = "GET", body } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
}

function account() {
  const email = `boundary-${crypto.randomUUID()}@example.test`;
  const password = "boundary-test-password";
  return {
    ...register({
      name: "Boundary Owner",
      email,
      password,
      organizationName: "Boundary Organization",
      restaurantName: "Boundary Restaurant",
      branchName: "Main",
      branchCode: "MAIN",
      currency: "SAR",
      timezone: "Asia/Riyadh"
    }),
    email,
    password
  };
}

function start(t) {
  const server = app.listen(0);
  t.after(() => server.close());
  return server;
}

async function member(server, owner, role, branchId) {
  const invited = await request(server, "/users/invite", {
    token: owner.token,
    method: "POST",
    body: { email: `boundary-member-${crypto.randomUUID()}@example.test`, role, branchId }
  });
  assert.equal(invited.status, 201, JSON.stringify(invited.payload));
  return login({ email: invited.payload.email, password: invited.payload.temporaryPassword });
}

function conversation(owner, branchId, question) {
  const sessionId = chatRepository.createSession(owner.restaurant.id, branchId, question);
  chatRepository.addMessage(sessionId, "user", question);
  const messageId = chatRepository.addMessage(sessionId, "assistant", `Answer to ${question}`);
  chatRepository.saveFeedback({
    restaurantId: owner.restaurant.id,
    ownerId: owner.user.id,
    sessionId,
    messageId,
    question,
    originalAnswer: `Answer to ${question}`,
    rating: "approved"
  });
  return { sessionId, messageId };
}

async function financialEntry(server, owner, branchId, sourceReference) {
  const response = await request(server, "/financial/entries", {
    token: owner.token,
    method: "POST",
    body: {
      category: "sales",
      branchId,
      amountMinor: 12345,
      occurredAt: new Date().toISOString(),
      sourceReference
    }
  });
  assert.equal(response.status, 201, JSON.stringify(response.payload));
}

test("restaurant-wide training exports reject managers and viewers at both HTTP and service boundaries", async (t) => {
  const server = start(t);
  const owner = account();
  const secondBranch = await request(server, "/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Private branch", code: "PRIVATE", city: "Jeddah" }
  });
  assert.equal(secondBranch.status, 201);
  conversation(owner, secondBranch.payload.id, "Private branch financial question");
  const manager = await member(server, owner, "branch_manager", owner.branches[0].id);
  const viewer = await member(server, owner, "viewer");

  assert.equal((await request(server, "/training/export")).status, 401);
  for (const user of [manager, viewer]) {
    const response = await request(server, "/training/export", { token: user.token });
    assert.equal(response.status, 403);
    assert.doesNotMatch(JSON.stringify(response.payload), /Private branch financial question/);
    const context = authenticateBearerHeader(`Bearer ${user.token}`);
    assert.throws(
      () => exportTrainingFeedback(context),
      (error) => error.status === 403 && error.code === "FORBIDDEN"
    );
  }
  const permitted = await request(server, "/training/export", { token: owner.token });
  assert.equal(permitted.status, 200);
  assert.deepEqual(
    permitted.payload.map((row) => row.question),
    ["Private branch financial question"]
  );
});

test("chat, feedback, knowledge, financial entries and exports remain isolated by current restaurant", async (t) => {
  const server = start(t);
  const owner = account();
  const foreignOwner = account();
  const sibling = await request(server, "/restaurants", {
    token: owner.token,
    method: "POST",
    body: { name: "Sibling restaurant" }
  });
  assert.equal(sibling.status, 201);
  const siblingOwner = login({
    email: owner.email,
    password: owner.password,
    organizationId: owner.organization.id,
    restaurantId: sibling.payload.id
  });
  const siblingBranch = await request(server, "/branches", {
    token: siblingOwner.token,
    method: "POST",
    body: { name: "Sibling Main", code: "SIBLING", city: "Jeddah" }
  });
  assert.equal(siblingBranch.status, 201);
  siblingOwner.branches = [siblingBranch.payload];

  const ownQuestion = `ownsecret${crypto.randomUUID().replaceAll("-", "")}`;
  conversation(owner, owner.branches[0].id, ownQuestion);
  await financialEntry(server, owner, owner.branches[0].id, ownQuestion);
  for (const other of [foreignOwner, siblingOwner]) {
    const privateQuestion = `foreignsecret${crypto.randomUUID().replaceAll("-", "")}`;
    const { sessionId, messageId } = conversation(other, other.branches[0].id, privateQuestion);
    await financialEntry(server, other, other.branches[0].id, privateQuestion);
    const knowledge = await request(server, "/knowledge/import", {
      token: other.token,
      method: "POST",
      body: { title: "Private knowledge", content: privateQuestion }
    });
    assert.equal(knowledge.status, 201);
    const otherSearch = await request(server, `/knowledge/search?q=${privateQuestion}`, { token: other.token });
    assert.equal(otherSearch.status, 200);
    assert.equal(otherSearch.payload.length, 1);

    for (const suffix of ["", `?branchId=${other.branches[0].id}`]) {
      assert.equal(
        (await request(server, `/chat/sessions/${sessionId}/messages${suffix}`, { token: owner.token })).status,
        404
      );
    }
    const feedback = await request(server, "/feedback", {
      token: owner.token,
      method: "POST",
      body: { sessionId, messageId, rating: "approved" }
    });
    assert.equal(feedback.status, 404);
    assert.equal(
      (await request(server, `/financial/entries?branchId=${other.branches[0].id}`, { token: owner.token })).status,
      404
    );
    assert.equal(
      (await request(server, `/financial/calculate?branchId=${other.branches[0].id}`, { token: owner.token })).status,
      404
    );
    const illegalEntry = await request(server, "/financial/entries", {
      token: owner.token,
      method: "POST",
      body: {
        category: "sales",
        amountMinor: 999,
        branchId: other.branches[0].id,
        occurredAt: new Date().toISOString(),
        sourceReference: "cross-restaurant-write"
      }
    });
    assert.equal(illegalEntry.status, 404);

    const context = authenticateBearerHeader(`Bearer ${other.token}`);
    const connector = createConnector(context, { name: "Private import", templateKey: "menu" });
    const job = previewConnector(context, connector.id, {
      filename: "private.csv",
      buffer: Buffer.from("item_code,name,category,selling_price,active\nPRIVATE,Private item,Food,10,true"),
      requestId: crypto.randomUUID()
    });
    assert.equal(job.validationStatus, "ready");
    const foreignJobPaths = [
      ["GET", `/data/import-jobs/${job.id}`, undefined],
      ["PUT", `/data/import-jobs/${job.id}/mapping`, { mappings: [] }],
      ["POST", `/data/import-jobs/${job.id}/confirm`, { confirmationToken: job.confirmationToken }],
      ["POST", `/data/import-jobs/${job.id}/cancel`, {}],
      ["GET", `/integrations/${connector.id}/history`, undefined],
      ["POST", `/integrations/${connector.id}/jobs/${job.id}/confirm`, { confirmationToken: job.confirmationToken }]
    ];
    for (const [method, path, body] of foreignJobPaths) {
      assert.equal((await request(server, path, { token: owner.token, method, body })).status, 404, path);
    }
    const unchangedJob = await request(server, `/data/import-jobs/${job.id}`, { token: other.token });
    assert.equal(unchangedJob.status, 200);
    assert.equal(unchangedJob.payload.status, "preview_ready");
    const search = await request(server, `/knowledge/search?q=${privateQuestion}`, { token: owner.token });
    assert.equal(search.status, 200);
    assert.deepEqual(search.payload, []);
  }

  for (const path of ["/training/export", "/chat/sessions", "/financial/entries"]) {
    const response = await request(server, path, { token: owner.token });
    assert.equal(response.status, 200, path);
    assert.match(JSON.stringify(response.payload), new RegExp(ownQuestion));
    assert.doesNotMatch(JSON.stringify(response.payload), /foreignsecret/);
  }
  // Owners may deliberately request sibling-restaurant rollups in their own
  // organization, but never another organization's restaurant or branch.
  assert.equal(
    (
      await request(server, `/financial/report?scope=restaurant&restaurantId=${foreignOwner.restaurant.id}`, {
        token: owner.token
      })
    ).status,
    404
  );
});

test("branch managers cannot read or annotate another branch's data", async (t) => {
  const server = start(t);
  const owner = account();
  const privateBranch = await request(server, "/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Other branch", code: "OTHER", city: "Jeddah" }
  });
  assert.equal(privateBranch.status, 201);
  const ownBranch = owner.branches[0].id;
  const otherBranch = privateBranch.payload.id;
  const manager = await member(server, owner, "branch_manager", ownBranch);
  const ownSession = conversation(owner, ownBranch, "Assigned branch question");
  const privateSession = conversation(owner, otherBranch, "Unassigned branch question");
  await financialEntry(server, owner, ownBranch, "assigned-branch-sale");
  await financialEntry(server, owner, otherBranch, "unassigned-branch-sale");

  const visible = await request(server, "/financial/entries", { token: manager.token });
  assert.equal(visible.status, 200);
  assert.deepEqual(
    visible.payload.map((row) => row.source_reference),
    ["assigned-branch-sale"]
  );
  const sessions = await request(server, "/chat/sessions", { token: manager.token });
  assert.equal(sessions.status, 200);
  assert.deepEqual(
    sessions.payload.map((row) => row.id),
    [ownSession.sessionId]
  );
  assert.equal(
    (await request(server, `/chat/sessions/${ownSession.sessionId}/messages`, { token: manager.token })).status,
    200
  );
  for (const path of [
    `/chat/sessions?branchId=${otherBranch}`,
    `/chat/sessions/${privateSession.sessionId}/messages`,
    `/chat/sessions/${privateSession.sessionId}/messages?branchId=${otherBranch}`,
    `/dashboard?branchId=${otherBranch}`,
    `/financial/entries?branchId=${otherBranch}`,
    `/financial/calculate?branchId=${otherBranch}`,
    `/financial/report?scope=branch&branchId=${otherBranch}`
  ]) {
    assert.equal((await request(server, path, { token: manager.token })).status, 404, path);
  }
  for (const branchId of [undefined, otherBranch]) {
    const response = await request(server, "/feedback", {
      token: manager.token,
      method: "POST",
      body: { ...privateSession, rating: "approved", branchId }
    });
    assert.equal(response.status, 404);
  }
  assert.equal((await request(server, "/financial/report?scope=restaurant", { token: manager.token })).status, 403);
});

test("viewers cannot mutate tenant operational resources", async (t) => {
  const server = start(t);
  const owner = account();
  const viewer = await member(server, owner, "viewer");
  const protectedWrites = [
    ["POST", "/branches"],
    ["PATCH", `/branches/${owner.branches[0].id}`],
    ["POST", "/users/invite"],
    ["POST", "/financial/entries"],
    ["POST", "/knowledge/import"],
    ["POST", "/data/import"],
    ["POST", "/data/import-jobs/preview"],
    ["POST", "/integrations"],
    ["POST", "/experience/daily"],
    ["POST", "/decisions/actions"],
    ["POST", "/forecasts/snapshots"],
    ["POST", "/seasons"],
    ["POST", "/alerts/refresh"],
    ["PATCH", "/alerts/1"],
    ["POST", "/reports/schedules"],
    ["POST", "/actions/unauthorized/confirm"]
  ];
  for (const [method, path] of protectedWrites) {
    const response = await request(server, path, { token: viewer.token, method, body: {} });
    assert.equal(response.status, 403, `${method} ${path}: ${JSON.stringify(response.payload)}`);
  }
});

test("inviting an existing organization member cannot bypass role changes or demote its last owner", async (t) => {
  const server = start(t);
  const owner = account();
  const viewer = await member(server, owner, "viewer");
  for (const [email, role, branchId] of [
    [owner.email.toUpperCase(), "viewer", undefined],
    [viewer.user.email, "branch_manager", owner.branches[0].id]
  ]) {
    const response = await request(server, "/users/invite", {
      token: owner.token,
      method: "POST",
      body: { email, role, branchId }
    });
    assert.equal(response.status, 409, JSON.stringify(response.payload));
    assert.equal(response.payload.code, "CONFLICT");
    assert.equal(response.payload.temporaryPassword, undefined);
  }
  const users = await request(server, "/users", { token: owner.token });
  assert.equal(users.status, 200);
  assert.equal(users.payload.find((user) => user.id === owner.user.id).role, "owner");
  assert.equal(users.payload.find((user) => user.id === viewer.user.id).role, "viewer");
  assert.equal(users.payload.filter((user) => user.role === "owner").length, 1);

  // Identities already registered elsewhere may still join a new organization;
  // their password and existing memberships must remain unchanged.
  const otherOwner = account();
  const invitation = await request(server, "/users/invite", {
    token: otherOwner.token,
    method: "POST",
    body: { email: owner.email, role: "viewer" }
  });
  assert.equal(invitation.status, 201);
  assert.equal(invitation.payload.existingAccount, true);
  assert.equal(invitation.payload.temporaryPassword, null);
  const newMembership = login({
    email: owner.email,
    password: owner.password,
    organizationId: otherOwner.organization.id,
    restaurantId: otherOwner.restaurant.id
  });
  assert.equal(newMembership.user.role, "viewer");
  assert.equal(newMembership.organization.id, otherOwner.organization.id);
  const originalMembership = login({
    email: owner.email,
    password: owner.password,
    organizationId: owner.organization.id,
    restaurantId: owner.restaurant.id
  });
  assert.equal(originalMembership.user.role, "owner");
});
