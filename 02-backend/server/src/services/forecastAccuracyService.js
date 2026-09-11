import { getDataRevision } from "./dataRevisionService.js";
import { z } from "zod";
import { db } from "../db.js";
import { validate, forecastQuerySchema } from "../validation/schemas.js";
import { forbidden } from "../errors/appError.js";
import { getForecast } from "./forecastService.js";
import { authorizedBranches } from "./alertCenterService.js";
import { localDate, dayOffset, mean, rounded, safe } from "./historicalSeriesService.js";
import { resolveFinancialDateRange } from "./financialPeriodService.js";
export function saveForecastSnapshot(user, body) {
  if (!["owner", "branch_manager"].includes(user.role)) throw forbidden();
  // A caller cannot backdate a prediction after seeing actuals.
  const parsed = validate(forecastQuerySchema.omit({ anchor: true }).strict(), body);
  const anchor = new Date().toISOString(),
    forecast = getForecast(user, { ...parsed, anchor });
  let saved = 0;
  db.transaction(() => {
    for (const branch of forecast.branches) {
      if (!branch.daily.some((day) => day.revenueMinor !== null)) continue;
      const snapshot = {
        version: forecast.version,
        currencyCode: forecast.currencyCode,
        timezone: forecast.timezone,
        history: forecast.history,
        daily: branch.daily,
        baselineEvidence: branch.evidence.history.map((day) => ({
          date: day.date,
          revenueMinor: day.revenueMinor,
          salesLineage: day.salesLineage
        }))
      };
      saved += db
        .prepare(
          "INSERT OR IGNORE INTO forecast_snapshots(organization_id,restaurant_id,branch_id,created_by,created_at,horizon,revision,forecast_json) VALUES (?,?,?,?,?,?,?,?)"
        )
        .run(
          user.organization_id,
          branch.restaurantId,
          branch.branchId,
          user.owner_id,
          anchor,
          parsed.horizon,
          getDataRevision({ ...user, restaurant_id: branch.restaurantId }).revision,
          JSON.stringify(snapshot)
        ).changes;
    }
  })();
  return { saved, createdAt: anchor };
}
export function forecastAccuracy(user, query) {
  const parsed = validate(
    z
      .object({
        scope: z.enum(["organization", "restaurant", "branch"]).optional(),
        restaurantId: z.coerce.number().int().positive().optional(),
        branchId: z.coerce.number().int().positive().optional()
      })
      .strict(),
    query
  );
  const ids = authorizedBranches(user, parsed).map((branch) => branch.id);
  if (!ids.length) return { groups: [], points: [] };
  const snapshots = db
    .prepare(
      `SELECT * FROM forecast_snapshots WHERE organization_id=? AND branch_id IN (${ids.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 100`
    )
    .all(user.organization_id, ...ids);
  const cutoff = dayOffset(localDate(new Date().toISOString(), user.timezone), -1),
    points = [],
    seen = new Set();
  for (const record of snapshots) {
    const snapshot = JSON.parse(record.forecast_json);
    for (const day of snapshot.daily) {
      const key = `${record.branch_id}:${record.horizon}:${day.date}`;
      if (day.date > cutoff || day.revenueMinor == null || seen.has(key)) continue;
      const range = resolveFinancialDateRange(day.date, snapshot.timezone).current;
      if (Date.parse(record.created_at) >= Date.parse(range.from)) continue;
      seen.add(key);
      const rows = db
        .prepare(
          "SELECT id,gross_sales_minor,discount_minor,refund_amount_minor FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND branch_id=? AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?) LIMIT 50001"
        )
        .all(user.organization_id, record.restaurant_id, record.branch_id, range.from, range.to);
      if (!rows.length || rows.length > 50000) continue;
      const actual = safe(
        rows.reduce(
          (n, row) => n + BigInt(row.gross_sales_minor) - BigInt(row.discount_minor) - BigInt(row.refund_amount_minor),
          0n
        )
      );
      const error = BigInt(day.revenueMinor) - BigInt(actual),
        absolute = safe(error < 0n ? -error : error);
      points.push({
        snapshotId: record.id,
        branchId: record.branch_id,
        horizon: record.horizon,
        date: day.date,
        predictedMinor: day.revenueMinor,
        actualMinor: actual,
        absoluteErrorMinor: absolute,
        absolutePercentageErrorBps:
          actual === 0
            ? null
            : rounded(BigInt(absolute) * 10000n, BigInt(actual) < 0n ? -BigInt(actual) : BigInt(actual)),
        actualLineage: rows.map((row) => row.id),
        baselineRevision: record.revision
      });
    }
  }
  const groups = [1, 7, 30].map((horizon) => {
    const items = points.filter((p) => p.horizon === horizon).sort((a, b) => a.date.localeCompare(b.date)),
      mape = items.map((p) => p.absolutePercentageErrorBps).filter((v) => v !== null),
      split = Math.floor(items.length / 2),
      older = mean(items.slice(0, split).map((p) => p.absoluteErrorMinor)),
      recent = mean(items.slice(split).map((p) => p.absoluteErrorMinor));
    return {
      horizon,
      count: items.length,
      maeMinor: mean(items.map((p) => p.absoluteErrorMinor)),
      mapeBps: mean(mape),
      zeroActualCount: items.length - mape.length,
      drift:
        items.length < 10
          ? "insufficient_data"
          : older === 0
            ? recent > 0
              ? "increased_error"
              : "stable"
            : BigInt(recent) * 100n > BigInt(older) * 150n
              ? "increased_error"
              : "stable",
      olderMaeMinor: older,
      recentMaeMinor: recent
    };
  });
  return {
    groups,
    points,
    policy:
      "Latest pre-outcome snapshot per branch/horizon/date; only completed dates with recorded sales. MAE in minor units, MAPE excludes zero actuals. Drift compares recent and older halves with >=10 points and >50% MAE increase; observational signal, not causal proof. Latest 100 snapshots are evaluated."
  };
}
