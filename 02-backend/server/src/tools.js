import { db } from "./db.js";
import { searchKnowledgeBase } from "./knowledge.js";

const normalizeContext = (scope) => (typeof scope === "object" ? scope : { restaurantId: scope });
const scopedParams = (context) =>
  context.branchId ? [context.restaurantId, context.branchId] : [context.restaurantId];
const branchClause = (context, alias = "") => (context.branchId ? ` AND ${alias}branch_id=?` : "");

// --- Timezone helpers (H2): compute local dates/hours in the organization's
// timezone via Intl instead of hard-coding Asia/Shanghai or assuming UTC. ---
const pad2 = (value) => String(value).padStart(2, "0");

function tzParts(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const parts = {};
    for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
      second: Number(parts.second)
    };
  } catch {
    // Unknown or missing timezone falls back to UTC instead of crashing the tool.
    const value = new Date(date);
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds()
    };
  }
}

export function isoDayInTz(timeZone = "UTC", date = new Date()) {
  const parts = tzParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

// The calendar day "now" resolves to inside the restaurant scope's timezone.
export function localDay(scope) {
  return isoDayInTz(normalizeContext(scope).timezone || "UTC");
}

export function hourInTz(isoString, timeZone = "UTC") {
  return tzParts(new Date(isoString), timeZone).hour;
}

function tzOffsetMs(date, timeZone) {
  const parts = tzParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

// Convert a wall-clock date+time in `timeZone` to an ISO UTC instant.
function zonedTimeToUtc(dateStr, time, timeZone, plusDay = 0) {
  const [hour, minute] = time.split(":").map(Number);
  const base = Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)) + plusDay,
    hour,
    minute,
    0,
    0
  );
  let utc = base - tzOffsetMs(new Date(base), timeZone);
  utc = base - tzOffsetMs(new Date(utc), timeZone); // second pass settles DST boundaries
  return new Date(utc).toISOString();
}

// Shared "day" definition: range "today" always means the current operating
// day (timezone + operating hours aware), so get_daily_sales,
// get_profit_summary and get_refund_summary agree on what "today" is.
function rangeFor(range = "week", context = { timezone: "UTC" }) {
  if (range === "today") return operationalBounds(context);
  const end = new Date();
  const start = new Date();
  const days = range === "month" ? 30 : 7;
  start.setDate(end.getDate() - days);
  return [start.toISOString(), end.toISOString()];
}

function operationalBounds(context, date = isoDayInTz(context.timezone || "UTC")) {
  const branch = context.branchId
    ? db
        .prepare("SELECT operating_day_start,operating_day_end FROM branches WHERE id=? AND restaurant_id=?")
        .get(context.branchId, context.restaurantId)
    : null;
  const start = branch?.operating_day_start || "00:00";
  const end = branch?.operating_day_end || "23:59";
  const afterMidnight = end <= start;
  const timeZone = context.timezone || "UTC";
  return [zonedTimeToUtc(date, start, timeZone), zonedTimeToUtc(date, end, timeZone, afterMidnight ? 1 : 0)];
}

// Resolve a menu item by (partial) name for owner-confirmation flows (C1).
export function resolveMenuItem(context, nameQuery) {
  const query = String(nameQuery || "").trim();
  if (!query) return { status: "missing_name" };
  const exact = db
    .prepare("SELECT id,name,active FROM menu_items WHERE restaurant_id=? AND lower(name)=lower(?)")
    .all(context.restaurantId, query);
  if (exact.length === 1) return { status: "ok", item: exact[0] };
  const partial = db
    .prepare("SELECT id,name,active FROM menu_items WHERE restaurant_id=? AND lower(name) LIKE lower(?)")
    .all(context.restaurantId, `%${query}%`);
  if (partial.length === 1) return { status: "ok", item: partial[0] };
  if (partial.length > 1) return { status: "ambiguous", items: partial };
  return { status: "not_found" };
}

export const toolDefinitions = [
  [
    "get_daily_sales",
    "Get branch-aware sales, order count, estimated net operating profit and peak hour for an operating day",
    { date: { type: "string", description: "YYYY-MM-DD date" } }
  ],
  [
    "get_profit_summary",
    "Get branch-aware revenue, refunds, labor, costs, estimated profit and margin for a range",
    { range: { type: "string", enum: ["today", "week", "month"] } }
  ],
  ["get_top_dishes", "Get best-selling dishes by revenue", {}],
  ["get_low_performance_items", "Find low-margin or low-selling menu items", {}],
  ["get_inventory_status", "Get branch stock levels and low-stock alerts", {}],
  [
    "get_refund_summary",
    "Get refund count, value, and common reasons for a range",
    { range: { type: "string", enum: ["today", "week", "month"] } }
  ],
  [
    "search_knowledge_base",
    "Search uploaded restaurant books and SOPs for relevant guidance",
    { query: { type: "string" } }
  ],
  [
    "create_report",
    "Create and save an operations report after owner confirmation",
    { type: { type: "string" }, date_range: { type: "string", enum: ["today", "week", "month"] } }
  ],
  [
    "suggest_staffing",
    "Suggest staffing from order demand",
    { level: { type: "string", enum: ["normal", "busy", "auto"] }, date_time: { type: "string" } }
  ],
  [
    "flag_menu_item",
    "Activate or deactivate a menu item after owner confirmation",
    { item_id: { type: "integer" }, action: { type: "string", enum: ["activate", "deactivate"] } }
  ]
].map(([name, description, properties]) => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false }
}));

const ordersBetween = (context, start, end) =>
  db
    .prepare(
      `SELECT * FROM orders WHERE restaurant_id=?${branchClause(context)} AND created_at BETWEEN ? AND ? ORDER BY created_at`
    )
    .all(...scopedParams(context), start, end);
const refundsBetween = (context, start, end) =>
  db
    .prepare(
      `SELECT amount,reason FROM refunds WHERE restaurant_id=?${branchClause(context)} AND created_at BETWEEN ? AND ?`
    )
    .all(...scopedParams(context), start, end);
const shiftsBetween = (context, start, end) =>
  db
    .prepare(
      `SELECT start_at,end_at,hourly_rate FROM staff_shifts WHERE restaurant_id=?${branchClause(context)} AND start_at < ? AND end_at > ?`
    )
    .all(...scopedParams(context), end, start);

function laborCost(rows, start, end) {
  return rows.reduce((sum, row) => {
    const overlapStart = Math.max(new Date(row.start_at).getTime(), new Date(start).getTime());
    const overlapEnd = Math.min(new Date(row.end_at).getTime(), new Date(end).getTime());
    return sum + (Math.max(0, overlapEnd - overlapStart) / 36e5) * row.hourly_rate;
  }, 0);
}

function totals(orders, refunds = [], labor = 0) {
  const revenue = orders.reduce((s, o) => s + o.total_price, 0);
  const food = orders.reduce((s, o) => s + o.cost, 0);
  const discounts = orders.reduce((s, o) => s + (o.discount || 0), 0);
  const commissions = orders.reduce((s, o) => s + (o.commission || 0), 0);
  const other = orders.reduce((s, o) => s + (o.other_cost || 0), 0);
  const refunded = refunds.reduce((s, r) => s + r.amount, 0);
  const netRevenue = revenue - discounts - refunded;
  const totalCost = food + commissions + other + labor;
  const profit = netRevenue - totalCost;
  return {
    revenue: +revenue.toFixed(2),
    discounts: +discounts.toFixed(2),
    refunded_amount: +refunded.toFixed(2),
    net_revenue: +netRevenue.toFixed(2),
    food_cost: +food.toFixed(2),
    commission_cost: +commissions.toFixed(2),
    labor_cost: +labor.toFixed(2),
    other_cost: +other.toFixed(2),
    cost: +totalCost.toFixed(2),
    profit: +profit.toFixed(2),
    margin_percent: netRevenue ? +((profit / netRevenue) * 100).toFixed(1) : 0,
    orders: orders.length,
    profit_label: "estimated net operating profit"
  };
}

export function executeTool(name, args = {}, scope) {
  const context = normalizeContext(scope);
  if (!context.restaurantId) throw new Error("Restaurant scope is required.");

  if (name === "get_daily_sales") {
    const date = args.date || isoDayInTz(context.timezone || "UTC");
    const [start, end] = operationalBounds(context, date);
    const rows = ordersBetween(context, start, end);
    const result = totals(
      rows,
      refundsBetween(context, start, end),
      laborCost(shiftsBetween(context, start, end), start, end)
    );
    const timeZone = context.timezone || "UTC";
    const hours = rows.reduce((a, o) => {
      const h = hourInTz(o.created_at, timeZone);
      a[h] = (a[h] || 0) + o.total_price;
      return a;
    }, {});
    const peak = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
    return {
      date,
      branch_id: context.branchId || null,
      timezone: context.timezone || "UTC",
      operating_window: { start, end },
      ...result,
      peak_hour: peak ? `${pad2(peak[0])}:00-${pad2(+peak[0] + 1)}:00` : null
    };
  }

  if (name === "get_profit_summary") {
    const [start, end] = rangeFor(args.range, context);
    return {
      range: args.range,
      branch_id: context.branchId || null,
      ...totals(
        ordersBetween(context, start, end),
        refundsBetween(context, start, end),
        laborCost(shiftsBetween(context, start, end), start, end)
      )
    };
  }

  if (name === "get_top_dishes" || name === "get_low_performance_items") {
    const [start, end] = rangeFor("month", context);
    const map = {};
    ordersBetween(context, start, end).forEach((order) =>
      JSON.parse(order.items).forEach((item) => {
        const row = (map[item.name] ||= { name: item.name, units: 0, revenue: 0, profit: 0 });
        row.units += item.quantity;
        row.revenue += item.price * item.quantity;
        row.profit += (item.price - item.cost) * item.quantity;
      })
    );
    const items = Object.values(map).map((row) => ({
      ...row,
      revenue: +row.revenue.toFixed(2),
      profit: +row.profit.toFixed(2),
      margin_percent: row.revenue ? +((row.profit / row.revenue) * 100).toFixed(1) : 0
    }));
    return name === "get_top_dishes"
      ? items.sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      : items
          .filter((item) => item.margin_percent < 35 || item.units < 5)
          .sort((a, b) => a.margin_percent - b.margin_percent);
  }

  if (name === "get_inventory_status") {
    const items = db
      .prepare(
        `SELECT id,branch_id,item_name,quantity,threshold FROM inventory WHERE restaurant_id=?${branchClause(context)} ORDER BY quantity<=threshold DESC,item_name`
      )
      .all(...scopedParams(context));
    return {
      items: items.map((item) => ({ ...item, status: item.quantity <= item.threshold ? "low" : "ok" })),
      low_stock_count: items.filter((item) => item.quantity <= item.threshold).length
    };
  }

  if (name === "get_refund_summary") {
    const [start, end] = rangeFor(args.range, context);
    const rows = refundsBetween(context, start, end);
    const reasons = rows.reduce((result, row) => {
      const reason = row.reason || "Unspecified";
      result[reason] = (result[reason] || 0) + 1;
      return result;
    }, {});
    return {
      range: args.range,
      refunds: rows.length,
      refunded_amount: +rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2),
      top_reasons: Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count }))
    };
  }

  if (name === "search_knowledge_base")
    return { query: args.query, results: searchKnowledgeBase(args.query, context.restaurantId) };

  if (name === "suggest_staffing") {
    const timeZone = context.timezone || "UTC";
    const date = args.date_time ? isoDayInTz(timeZone, new Date(args.date_time)) : isoDayInTz(timeZone);
    const sales = executeTool("get_daily_sales", { date }, context);
    const demand = args.level === "busy" ? Math.max(sales.orders, 40) : sales.orders;
    // Single source of truth for staffing thresholds (M5): both the Arabic and
    // English reply templates map from this level instead of re-deriving it.
    const level = demand >= 40 ? "high" : demand >= 25 ? "medium" : "standard";
    return {
      date_time: args.date_time,
      expected_orders: demand,
      level,
      recommendation:
        level === "high"
          ? "Schedule 1 extra server and 1 extra line cook for peak service."
          : level === "medium"
            ? "Add 1 flexible server during peak hour."
            : "Standard staffing is sufficient.",
      basis: "branch-scoped orders and observed peak demand"
    };
  }

  if (name === "flag_menu_item") {
    if (context.role !== "owner") throw new Error("Only owners can change menu item status.");
    const result = db
      .prepare("UPDATE menu_items SET active=? WHERE id=? AND restaurant_id=?")
      .run(args.action === "activate" ? 1 : 0, args.item_id, context.restaurantId);
    return { updated: result.changes === 1, item_id: args.item_id, action: args.action };
  }

  if (name === "create_report") {
    if (context.role !== "owner") throw new Error("Only owners can create saved reports.");
    const summary = executeTool("get_profit_summary", { range: args.date_range }, context);
    const inventory = executeTool("get_inventory_status", {}, context);
    const content = {
      type: args.type,
      summary,
      inventory_alerts: inventory.items.filter((item) => item.status === "low"),
      generated_at: new Date().toISOString()
    };
    const id = db
      .prepare("INSERT INTO reports(restaurant_id,branch_id,type,date_range,content) VALUES (?,?,?,?,?)")
      .run(
        context.restaurantId,
        context.branchId || null,
        args.type,
        args.date_range,
        JSON.stringify(content)
      ).lastInsertRowid;
    return { report_id: id, ...content };
  }

  throw new Error(`Unknown tool: ${name}`);
}
