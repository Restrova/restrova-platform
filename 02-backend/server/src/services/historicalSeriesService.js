import { db } from "../db.js";
import { validationError } from "../errors/appError.js";
import { getFinancialReport } from "./financialReportService.js";
import { resolveFinancialDateRange } from "./financialPeriodService.js";

export const dayOffset = (date, offset) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
export const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function safe(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw validationError("Historical amount exceeds supported integer range.");
  return n;
}
export const sum = (values) => safe(values.reduce((n, v) => n + BigInt(v), 0n));
export function rounded(n, d) {
  if (d <= 0) return null;
  const value = BigInt(n),
    divisor = BigInt(d);
  return safe((value < 0n ? -1n : 1n) * (((value < 0n ? -value : value) + divisor / 2n) / divisor));
}
export const mean = (values) =>
  values.length
    ? rounded(
        values.reduce((n, v) => n + BigInt(v), 0n),
        values.length
      )
    : null;
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b),
    m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : mean([sorted[m - 1], sorted[m]]);
}
export function localDate(value, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Authorization is resolved once before either source table is read.
export function getHistoricalSeries(user, parsed) {
  const anchor = parsed.anchor || new Date().toISOString();
  const today = localDate(anchor, user.timezone);
  const endDate = dayOffset(today, -1),
    startDate = dayOffset(endDate, -(parsed.historyDays - 1));
  const from = resolveFinancialDateRange(startDate, user.timezone).current.from;
  const to = resolveFinancialDateRange(endDate, user.timezone).current.to;
  const report = getFinancialReport(user, {
    scope: parsed.scope,
    branchId: parsed.branchId,
    restaurantId: parsed.restaurantId,
    period: "custom",
    comparison: "none",
    anchor,
    from,
    to
  });
  let salesCount = 0,
    ledgerCount = 0;
  const branches = report.restaurants.flatMap((restaurant) =>
    restaurant.branches.map((branch) => ({ ...branch, restaurantId: restaurant.id }))
  );
  const result = branches.map((branch) => {
    const lifecycle =
      db.prepare("SELECT opened_on,closed_on FROM branch_lifecycle WHERE branch_id=?").get(branch.id) || {};
    const sales = db
      .prepare(
        `SELECT id,created_at,external_order_id,external_line_id,gross_sales_minor,discount_minor,refund_amount_minor FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND branch_id=? AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?) ORDER BY created_at,id LIMIT 50001`
      )
      .all(user.organization_id, branch.restaurantId, branch.id, from, to);
    const ledger = db
      .prepare(
        `SELECT id,category,amount_minor,occurred_at,source_type,source_reference FROM financial_ledger_entries WHERE organization_id=? AND restaurant_id=? AND branch_id=? AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<=julianday(?) ORDER BY occurred_at,id LIMIT 50001`
      )
      .all(user.organization_id, branch.restaurantId, branch.id, from, to);
    salesCount += sales.length;
    ledgerCount += ledger.length;
    if (salesCount > 50000 || ledgerCount > 50000)
      throw validationError("History is limited to 50,000 rows per source. Shorten the history or select a branch.");
    const days = Array.from({ length: parsed.historyDays }, (_, i) => ({
      date: dayOffset(startDate, i),
      sales: [],
      ledger: []
    }));
    const byDate = new Map(days.map((day) => [day.date, day]));
    for (const row of sales) byDate.get(localDate(row.created_at, user.timezone))?.sales.push(row);
    for (const row of ledger) byDate.get(localDate(row.occurred_at, user.timezone))?.ledger.push(row);
    return {
      branchId: branch.id,
      restaurantId: branch.restaurantId,
      branchName: branch.name,
      lifecycle,
      days: days.map(({ date, sales: lines, ledger: entries }) => {
        const operating = Boolean(
          lifecycle.opened_on && lifecycle.opened_on <= date && (!lifecycle.closed_on || date < lifecycle.closed_on)
        );
        const gross = sum(lines.map((row) => row.gross_sales_minor));
        const discounts = sum(lines.map((row) => row.discount_minor)),
          refunds = sum(lines.map((row) => row.refund_amount_minor));
        return {
          date,
          operating,
          observed: operating && lines.length > 0,
          grossSalesMinor: lines.length ? gross : null,
          revenueMinor: lines.length ? safe(BigInt(gross) - BigInt(discounts) - BigInt(refunds)) : null,
          orderCount: lines.length ? new Set(lines.map((row) => row.external_order_id)).size : null,
          categories: Object.fromEntries(
            [...new Set(entries.map((row) => row.category))].map((category) => [
              category,
              sum(entries.filter((row) => row.category === category).map((row) => row.amount_minor))
            ])
          ),
          salesLineage: lines.map((row) => ({
            salesLineId: row.id,
            orderId: row.external_order_id,
            lineId: row.external_line_id
          })),
          ledgerLineage: entries.map((row) => ({
            ledgerEntryId: row.id,
            category: row.category,
            sourceType: row.source_type,
            sourceReference: row.source_reference
          }))
        };
      })
    };
  });
  return {
    hasUnallocatedLedger: report.restaurants.some(
      (restaurant) => restaurant.unallocated?.current?.completeness?.entryCount > 0
    ),
    anchor,
    today,
    startDate,
    endDate,
    timezone: report.timezone,
    currencyCode: report.currencyCode,
    scope: report.scope,
    branches: result
  };
}
