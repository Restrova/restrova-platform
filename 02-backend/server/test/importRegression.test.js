import test from "node:test";
import assert from "node:assert/strict";
import { start, request, db, account, roleToken } from "../test-support/operationsFixtures.js";
import { preview, confirm, operationalSnapshot, pipelineFixture } from "../test-support/importRegressionFixtures.js";

for (const format of ["csv", "xlsx"]) {
  test(`all four ${format} templates auto-detect, stage without writes, confirm once and retain exact UTF-8 data`, async (t) => {
    const server = start(t),
      f = await pipelineFixture(server),
      owner = f.owner;
    const metadata = await request(server, "/data/templates", { token: owner.token });
    assert.deepEqual(metadata.payload.map((m) => m.key).sort(), Object.keys(f.rows).sort());
    for (const key of ["branches", "menu", "costs", "sales"]) {
      const before = operationalSnapshot(owner),
        revision = (await request(server, "/data/revision", { token: owner.token })).payload.revision;
      const p = await preview(server, owner, key, f.rows[key], format);
      assert.equal(p.status, 201, JSON.stringify(p.payload));
      assert.equal(p.payload.templateKey, key);
      assert.equal(p.payload.detection.confidence, "high");
      assert.equal(p.payload.statistics.accepted, f.rows[key].length);
      assert.equal(p.payload.file.type, format);
      assert.deepEqual(operationalSnapshot(owner), before);
      assert.equal((await request(server, "/data/revision", { token: owner.token })).payload.revision, revision);
      const other = await account(server);
      assert.equal((await confirm(server, other, p.payload)).status, 404);
      const saved = await confirm(server, owner, p.payload);
      assert.equal(saved.status, 200, JSON.stringify(saved.payload));
      assert.equal(saved.payload.statistics.imported, f.rows[key].length);
      assert.equal((await request(server, "/data/revision", { token: owner.token })).payload.revision, revision + 1);
      const after = operationalSnapshot(owner);
      assert.equal((await confirm(server, owner, p.payload)).status, 409);
      assert.deepEqual(operationalSnapshot(owner), after);
    }
    const state = operationalSnapshot(owner);
    assert.equal(state.branches.find((b) => b.code === "REG").name, f.rows.branches[0].name);
    assert.equal(state.catalog_items.find((i) => i.item_code === "GOLD").name, f.rows.menu[0].name);
    assert.deepEqual(
      state.sales_lines.map((s) => [
        s.gross_sales_minor,
        s.discount_minor,
        s.refund_amount_minor,
        s.delivery_commission_minor
      ]),
      [
        [10005, 1005, 505, 600],
        [10105, 0, 0, 0]
      ]
    );
    const duplicate = await preview(server, owner, "sales", f.rows.sales, format);
    assert.equal(duplicate.payload.statistics.duplicates, 2);
    assert.equal((await confirm(server, owner, duplicate.payload)).payload.statistics.imported, 0);
    assert.deepEqual(operationalSnapshot(owner), state);
    assert.equal(state.item_costs[0].direct_food_cost_minor, 1235);
    assert.equal(state.item_costs[0].packaging_cost_minor, 115);
    const totals = Object.fromEntries(
      db
        .prepare(
          "SELECT category,sum(amount_minor) amount FROM financial_ledger_entries WHERE restaurant_id=? GROUP BY category"
        )
        .all(owner.restaurant.id)
        .map((r) => [r.category, r.amount])
    );
    assert.deepEqual(totals, {
      sales: 20110,
      discounts: 1005,
      refunds: 505,
      delivery_commissions: 600,
      food_costs: 3705,
      packaging: 345
    });
    const branchId = state.branches.find((b) => b.code === "REG").id;
    const query = {
      message: "Revenue yesterday",
      scope: "branch",
      branchId,
      language: "en",
      fromDate: f.date,
      toDate: f.date,
      requestKey: crypto.randomUUID()
    };
    const ai = await request(server, "/copilot/ask", { token: owner.token, method: "POST", body: query });
    assert.equal(ai.status, 200, JSON.stringify(ai.payload));
    assert.equal(ai.payload.answer.claims.find((c) => c.key === "revenue").value, 18600);
    assert.equal(ai.payload.answer.claims.find((c) => c.key === "orders").value, 1);
    const report = await request(
      server,
      `/reports/executive?scope=branch&branchId=${branchId}&fromDate=${f.date}&toDate=${f.date}&language=en`,
      { token: owner.token }
    );
    assert.equal(report.status, 200, JSON.stringify(report.payload));
    assert.equal(report.payload.claims.find((c) => c.key === "revenue").value, 18600);
    assert.equal(report.payload.claims.find((c) => c.key === "profit").value, null);
  });
}

for (const key of ["branches", "menu", "costs", "sales"]) {
  test(`${key} mixed valid/invalid rows block the entire confirmation and cannot be imported by viewers`, async (t) => {
    const server = start(t),
      f = await pipelineFixture(server),
      owner = f.owner;
    const badFields = {
      branches: { city: "" },
      menu: { selling_price: "-1" },
      costs: { direct_food_cost: "-1" },
      sales: { gross_sales: "-1" }
    };
    // Reference rows exist without using the template under test.
    db.prepare("UPDATE branches SET code='REG' WHERE id=?").run(owner.branches[0].id);
    db.prepare("UPDATE catalog_items SET item_code='GOLD' WHERE id=?").run(owner.itemId);
    const before = operationalSnapshot(owner);
    const bad = { ...f.rows[key][0], ...badFields[key] };
    if (key === "branches") bad.branch_code = "BAD";
    if (key === "menu" || key === "costs") bad.item_code = key === "menu" ? "BAD" : "GOLD";
    if (key === "sales") bad.external_line_id = "bad";
    const p = await preview(server, owner, key, [f.rows[key][0], bad], "csv", true);
    assert.equal(p.status, 201, JSON.stringify(p.payload));
    assert.equal(p.payload.validationStatus, "validation_failed");
    assert.ok(p.payload.statistics.rejected >= 1);
    assert.equal(p.payload.confirmationToken, null);
    assert.equal((await confirm(server, owner, p.payload)).status, 409);
    assert.deepEqual(operationalSnapshot(owner), before);
    const viewer = { ...owner, token: roleToken(owner, "viewer") };
    assert.equal((await preview(server, viewer, key, f.rows[key], "csv", true)).status, 403);
    assert.equal((await request(server, "/data/revision", { token: owner.token })).payload.revision, 0);
  });
}
