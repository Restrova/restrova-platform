import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db.js";
import { validate, priceSimulationSchema, costSimulationSchema } from "../validation/schemas.js";
import { forbidden, conflict, notFound, validationError } from "../errors/appError.js";
import { authorizedBranches } from "./alertCenterService.js";
import { getMenuRecommendations } from "./menuRecommendationService.js";
import { getBranchOperations } from "./branchOperationsService.js";
import { simulateCosts } from "./costSimulationService.js";
import { simulatePrice } from "./priceSimulationService.js";
import { getDataRevision } from "./dataRevisionService.js";
import { localDate, dayOffset, safe } from "./historicalSeriesService.js";
import { resolveFinancialDateRange } from "./financialPeriodService.js";

const scopeSchema = z
  .object({
    branchId: z.coerce.number().int().positive(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional()
  })
  .strict();
function scopeFor(user, query) {
  const parsed = validate(scopeSchema, query);
  const branch = authorizedBranches(user, {
    scope: "branch",
    branchId: parsed.branchId,
    restaurantId: user.restaurant_id
  })[0];
  if (!branch || branch.restaurantId !== user.restaurant_id) throw notFound();
  const today = localDate(new Date().toISOString(), user.timezone);
  const toDate = parsed.toDate || dayOffset(today, -1),
    fromDate = parsed.fromDate || dayOffset(toDate, -6);
  if (fromDate > toDate || toDate >= today || Date.parse(toDate) - Date.parse(fromDate) > 30 * 86400000)
    throw validationError("Use 1–31 completed dates.");
  return {
    ...parsed,
    fromDate,
    toDate,
    from: resolveFinancialDateRange(fromDate, user.timezone).current.from,
    to: resolveFinancialDateRange(toDate, user.timezone).current.to
  };
}
function envelope(category, key, problem, action, evidence, lineage, extra = {}) {
  return {
    key,
    category,
    problem,
    recommendedAction: action,
    evidence,
    lineage,
    businessImpact: { kind: "observed_evidence", amountMinor: null },
    expectedOutcome: { kind: "review_required", amountMinor: null },
    confidence: { level: "medium", limitations: ["Recorded imports may be incomplete; review before acting."] },
    ...extra
  };
}
export function getDecisions(user, query) {
  const scope = scopeFor(user, query),
    revision = getDataRevision(user),
    items = [];
  const menu = getMenuRecommendations(user, { branchId: scope.branchId, from: scope.from, to: scope.to, limit: 500 });
  for (const rec of menu.recommendations) {
    const category =
      rec.action === "raise_price" ? "pricing" : rec.action === "reduce_ingredient_cost" ? "cost" : "menu";
    items.push(
      envelope(category, rec.id, rec.rationale, rec.action, rec.evidence, rec.lineage, {
        item: rec.item,
        confidence: rec.confidence,
        businessImpact: { kind: "observed_contribution", amountMinor: rec.evidence.contributionProfitMinor }
      })
    );
    if (["promote_item", "bundle_item"].includes(rec.action))
      items.push(
        envelope(
          "promotion",
          `promotion:${rec.item.id}`,
          rec.rationale,
          "test_targeted_offer",
          rec.evidence,
          rec.lineage,
          { item: rec.item, requiresScenario: true }
        )
      );
  }
  const costs = db
    .prepare(
      "SELECT c.*,i.item_code,i.name FROM item_costs c JOIN catalog_items i ON i.id=c.catalog_item_id WHERE c.organization_id=? AND c.restaurant_id=? AND (c.branch_id IS NULL OR c.branch_id=?) AND julianday(c.effective_from)<=julianday(?) ORDER BY c.catalog_item_id,c.scope_key,julianday(c.effective_from) DESC,c.id DESC LIMIT 5001"
    )
    .all(user.organization_id, user.restaurant_id, scope.branchId, scope.to);
  if (costs.length > 5000) throw validationError("Cost history exceeds the 5000-record decision limit.");
  const seen = new Set();
  for (const cost of costs) {
    if (
      cost.branch_id === null &&
      costs.some((row) => row.catalog_item_id === cost.catalog_item_id && row.branch_id === scope.branchId)
    )
      continue;
    const key = `${cost.catalog_item_id}:${cost.scope_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const previous = costs.find(
      (row) =>
        row.id !== cost.id &&
        row.catalog_item_id === cost.catalog_item_id &&
        row.scope_key === cost.scope_key &&
        Date.parse(row.effective_from) < Date.parse(cost.effective_from)
    );
    if (!previous) continue;
    const current = safe(BigInt(cost.direct_food_cost_minor) + BigInt(cost.packaging_cost_minor)),
      before = safe(BigInt(previous.direct_food_cost_minor) + BigInt(previous.packaging_cost_minor));
    if (current <= before) continue;
    const sameSupplier = Boolean(cost.supplier_name && cost.supplier_name === previous.supplier_name);
    items.push(
      envelope(
        "cost",
        `cost:${cost.id}:${previous.id}`,
        sameSupplier ? "supplier_cost_increase" : "recorded_cost_increase",
        "review_supplier_quote",
        {
          previousUnitCostMinor: before,
          currentUnitCostMinor: current,
          increaseMinor: current - before,
          supplier: sameSupplier ? cost.supplier_name : null,
          scopeKey: cost.scope_key
        },
        { costIds: [previous.id, cost.id] },
        {
          item: { id: cost.catalog_item_id, itemCode: cost.item_code, name: cost.name },
          businessImpact: { kind: "unit_cost_increase", amountMinor: current - before },
          expectedOutcome: { kind: "negotiate_or_reformulate_no_assumed_savings", amountMinor: null }
        }
      )
    );
  }
  const operations = getBranchOperations(user, {
    ...(user.role === "branch_manager"
      ? { scope: "branch", branchId: scope.branchId }
      : { scope: "restaurant", restaurantId: user.restaurant_id }),
    period: "custom",
    fromDate: scope.fromDate,
    toDate: scope.toDate,
    comparison: "previous_period"
  });
  for (const op of operations.opportunities.filter((op) => op.branchId === scope.branchId))
    items.push(
      envelope(
        ["high_refunds", "abnormal_discounts", "rising_costs"].includes(op.type) ? "cost" : "branch",
        `branch:${op.id}`,
        op.type,
        `review_${op.type}`,
        { ...op.evidence, values: op.values, thresholdBps: op.thresholdBps },
        operations.scorecards.find((row) => row.branchId === scope.branchId)?.lineage || {},
        {
          confidence: {
            level: "medium",
            limitations: ["An observed association does not establish its cause or recoverable savings."]
          }
        }
      )
    );
  const proposals = items.map((item) => ({
    ...item,
    key: `${item.key}:${scope.fromDate}:${scope.toDate}`,
    branchId: scope.branchId,
    period: { fromDate: scope.fromDate, toDate: scope.toDate },
    dataRevision: revision.revision
  }));
  return {
    version: "8.1-v1",
    scope,
    currencyCode: user.currency,
    dataRevision: revision,
    recommendations: proposals,
    excluded: menu.excluded,
    pagination: menu.pagination,
    policy:
      "Confirmed item sales and effective costs feed menu, price and promotion decisions; recorded ledger and comparable sales feed branch opportunities. Missing evidence produces no recommendation. Money uses integer minor units. No action is executed automatically; modeled impact requires explicit assumptions."
  };
}
export function simulateDecision(user, body) {
  if (body?.kind === "cost") {
    const parsed = validate(
      costSimulationSchema
        .extend({
          kind: z.literal("cost"),
          branchId: z.number().int().positive(),
          minimumMarginBps: z.number().int().min(0).max(10000)
        })
        .strict(),
      body
    );
    authorizedBranches(user, { scope: "branch", branchId: parsed.branchId, restaurantId: user.restaurant_id });
    const { kind, minimumMarginBps, ...inputs } = parsed,
      result = simulateCosts(user, inputs);
    const eligible =
      result.scenarios.length > 0 &&
      result.scenarios.every(
        (s) =>
          s.contributionImpactMinor > 0 &&
          s.proposedContributionMinor > 0 &&
          s.proposedContributionMarginBps >= minimumMarginBps
      );
    return {
      ...result,
      kind,
      minimumMarginBps,
      eligible,
      expectedOutcome: { kind: "modeled_constant_quantity_not_guaranteed_savings", scenarios: result.scenarios }
    };
  }
  const schema = priceSimulationSchema
    .extend({
      branchId: z.number().int().positive(),
      kind: z.enum(["pricing", "promotion"]),
      minimumMarginBps: z.number().int().min(0).max(10000),
      demandChangesBps: z.array(z.number().int().min(-9000).max(10000)).min(1).max(9)
    })
    .strict();
  const parsed = validate(schema, body);
  authorizedBranches(user, { scope: "branch", branchId: parsed.branchId, restaurantId: user.restaurant_id });
  const { kind, minimumMarginBps, ...inputs } = parsed,
    result = simulatePrice(user, inputs),
    unit = result.unitEconomics;
  const eligible = Boolean(
    unit &&
    unit.proposedContributionMinor > 0 &&
    unit.proposedContributionMarginBps >= minimumMarginBps &&
    (kind !== "promotion" || unit.proposedPriceMinor < unit.currentPriceMinor)
  );
  return {
    ...result,
    kind,
    minimumMarginBps,
    eligible,
    decision: !unit ? "insufficient_data" : eligible ? "review_scenario" : "blocked_by_margin_or_discount_rule",
    expectedOutcome: { kind: "modeled_sensitivity_not_demand_forecast", scenarios: result.scenarios }
  };
}
function serialize(row) {
  return {
    ...row,
    snapshot: JSON.parse(row.snapshot_json),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    snapshot_json: undefined,
    result_json: undefined,
    history: db
      .prepare(
        "SELECT action,note,created_at AS createdAt FROM recommendation_history WHERE recommendation_id=? ORDER BY id"
      )
      .all(row.id)
  };
}
export function listDecisionActions(user, query) {
  const { branchId } = validate(scopeSchema.pick({ branchId: true }), query);
  authorizedBranches(user, { scope: "branch", branchId, restaurantId: user.restaurant_id });
  return {
    actions: db
      .prepare(
        "SELECT * FROM recommendation_actions WHERE organization_id=? AND restaurant_id=? AND branch_id=? ORDER BY id DESC LIMIT 100"
      )
      .all(user.organization_id, user.restaurant_id, branchId)
      .map(serialize)
  };
}
export function recordDecision(user, body) {
  if (user.role !== "owner") throw forbidden();
  const parsed = validate(scopeSchema.extend({ key: z.string().min(1).max(300) }), body),
    { key, ...scope } = parsed;
  const proposal = getDecisions(user, scope).recommendations.find((item) => item.key === key);
  if (!proposal) throw conflict("Recommendation changed; refresh its evidence.");
  const keyWithEvidence = `${key}:${crypto.createHash("sha256").update(JSON.stringify(proposal)).digest("hex").slice(0, 16)}`;
  return db.transaction(() => {
    const insert = db
      .prepare(
        "INSERT OR IGNORE INTO recommendation_actions(organization_id,restaurant_id,branch_id,recommendation_key,snapshot_json,created_by) VALUES (?,?,?,?,?,?)"
      )
      .run(
        user.organization_id,
        user.restaurant_id,
        scope.branchId,
        keyWithEvidence,
        JSON.stringify(proposal),
        user.owner_id
      );
    const row = db
      .prepare("SELECT * FROM recommendation_actions WHERE organization_id=? AND branch_id=? AND recommendation_key=?")
      .get(user.organization_id, scope.branchId, keyWithEvidence);
    if (insert.changes)
      db.prepare("INSERT INTO recommendation_history(recommendation_id,actor_id,action) VALUES (?,?,'proposed')").run(
        row.id,
        user.owner_id
      );
    return serialize(row);
  })();
}
function measure(user, row, days) {
  const actionDate = localDate(row.action_at, user.timezone),
    fromDate = dayOffset(actionDate, 1),
    toDate = dayOffset(actionDate, days),
    today = localDate(new Date().toISOString(), user.timezone);
  if (toDate >= today) throw conflict("Wait until the observation period is complete, then import its sales.");
  const snapshot = JSON.parse(row.snapshot_json);
  function period(start, end) {
    const range = {
      from: resolveFinancialDateRange(start, user.timezone).current.from,
      to: resolveFinancialDateRange(end, user.timezone).current.to
    };
    const rows = db
      .prepare(
        "SELECT id,catalog_item_id,created_at,gross_sales_minor,discount_minor,refund_amount_minor FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND branch_id=? AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?) LIMIT 50001"
      )
      .all(user.organization_id, user.restaurant_id, row.branch_id, range.from, range.to);
    if (rows.length > 50000) throw validationError("Observation exceeds 50000 sales lines.");
    const observed = new Set(rows.map((sale) => localDate(sale.created_at, user.timezone)));
    for (let date = start; date <= end; date = dayOffset(date, 1))
      if (!observed.has(date)) throw conflict("Import sales evidence for every observation date before measuring.");
    const selected = snapshot.item ? rows.filter((sale) => sale.catalog_item_id === snapshot.item.id) : rows;
    if (!selected.length) throw conflict("No item evidence; absence cannot prove zero sales.");
    return {
      fromDate: start,
      toDate: end,
      revenueMinor: safe(
        selected.reduce(
          (sum, sale) =>
            sum + BigInt(sale.gross_sales_minor) - BigInt(sale.discount_minor) - BigInt(sale.refund_amount_minor),
          0n
        )
      ),
      salesLineage: selected.map((sale) => sale.id)
    };
  }
  const before = period(dayOffset(actionDate, -days), dayOffset(actionDate, -1)),
    after = period(fromDate, toDate);
  return {
    days,
    before,
    after,
    revenueChangeMinor: safe(BigInt(after.revenueMinor) - BigInt(before.revenueMinor)),
    measuredRevision: getDataRevision(user).revision,
    attribution: "observational_before_after_not_causal",
    limitations: [
      "Recorded dates do not prove complete imports. Revenue change is not profit or savings. Action date is excluded; equal 7/14-day windows preserve weekday mix."
    ]
  };
}
export function transitionDecision(user, id, body) {
  const parsed = validate(
    z
      .object({
        status: z.enum(["accepted", "rejected", "action_taken", "measured"]),
        version: z.number().int().positive(),
        note: z.string().trim().min(1).max(1000),
        days: z.union([z.literal(7), z.literal(14)]).default(7)
      })
      .strict(),
    body
  );
  if (
    !["owner", "branch_manager"].includes(user.role) ||
    (["accepted", "rejected"].includes(parsed.status) && user.role !== "owner")
  )
    throw forbidden();
  const row = db
    .prepare("SELECT * FROM recommendation_actions WHERE id=? AND organization_id=? AND restaurant_id=?")
    .get(id, user.organization_id, user.restaurant_id);
  if (!row) throw notFound();
  authorizedBranches(user, { scope: "branch", branchId: row.branch_id, restaurantId: user.restaurant_id });
  if (row.version !== parsed.version) throw conflict("Recommendation changed; reload before continuing.");
  const allowed = { proposed: ["accepted", "rejected"], accepted: ["action_taken"], action_taken: ["measured"] };
  if (!allowed[row.status]?.includes(parsed.status)) throw conflict("Invalid recommendation transition.");
  const result = parsed.status === "measured" ? measure(user, row, parsed.days) : null,
    now = new Date().toISOString();
  return db.transaction(() => {
    const changed = db
      .prepare(
        "UPDATE recommendation_actions SET status=?,version=version+1,accepted_at=CASE WHEN ?='accepted' THEN ? ELSE accepted_at END,action_at=CASE WHEN ?='action_taken' THEN ? ELSE action_at END,measured_at=CASE WHEN ?='measured' THEN ? ELSE measured_at END,result_json=COALESCE(?,result_json) WHERE id=? AND version=?"
      )
      .run(
        parsed.status,
        parsed.status,
        now,
        parsed.status,
        now,
        parsed.status,
        now,
        result ? JSON.stringify(result) : null,
        row.id,
        parsed.version
      );
    if (!changed.changes) throw conflict();
    db.prepare("INSERT INTO recommendation_history(recommendation_id,actor_id,action,note) VALUES (?,?,?,?)").run(
      row.id,
      user.owner_id,
      parsed.status,
      parsed.note
    );
    return serialize(db.prepare("SELECT * FROM recommendation_actions WHERE id=?").get(row.id));
  })();
}
