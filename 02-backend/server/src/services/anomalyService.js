import { historicalQuerySchema, validate } from "../validation/schemas.js";
import { getHistoricalSeries, median, safe, weekday } from "./historicalSeriesService.js";

const translations = {
  ar: [
    "مبيعات خارج النطاق المعتاد",
    "راجع مبيعات اليوم مقارنة بنفس يوم الأسبوع، وتأكد من اكتمال البيانات قبل ما تحدد السبب."
  ],
  en: [
    "Sales outside the usual range",
    "Review this day's sales against the same weekday and verify data completeness before identifying a cause."
  ],
  zh: ["销售额超出常见范围", "将当日销售额与相同星期几进行比较，并在判断原因前核实数据完整性。"]
};
export function getAnomalies(user, query) {
  const parsed = validate(historicalQuerySchema, query),
    series = getHistoricalSeries(user, parsed);
  const evaluations = series.branches.map((branch) => {
    const current = branch.days.at(-1);
    const baseline = branch.days
      .slice(0, -1)
      .filter((day) => weekday(day.date) === weekday(current.date) && day.observed);
    const result = {
      branchId: branch.branchId,
      restaurantId: branch.restaurantId,
      branchName: branch.branchName,
      type: "sales_outlier",
      status: "insufficient_data",
      reason: null,
      title: translations[parsed.language][0],
      suggestedAction: translations[parsed.language][1],
      expectedImpactMinor: null,
      evidence: { current, baseline },
      baselineMedianMinor: null,
      madMinor: null,
      lowerMinor: null,
      upperMinor: null,
      distanceBps: null
    };
    if (!current.observed || baseline.length < 4) {
      result.reason = "requires_observed_day_and_four_same_weekdays";
      return result;
    }
    const center = median(baseline.map((day) => day.revenueMinor));
    const mad = median(
      baseline.map((day) =>
        safe(
          BigInt(day.revenueMinor) > BigInt(center)
            ? BigInt(day.revenueMinor) - BigInt(center)
            : BigInt(center) - BigInt(day.revenueMinor)
        )
      )
    );
    // Robust range: 3 * 1.4826 MAD, with a 10% median and one-minor-unit noise floor.
    const spread = safe(
      [
        1n,
        (BigInt(mad) * 44478n + 9999n) / 10000n,
        ((BigInt(center) < 0n ? -BigInt(center) : BigInt(center)) + 9n) / 10n
      ].reduce((a, b) => (a > b ? a : b))
    );
    result.baselineMedianMinor = center;
    result.madMinor = mad;
    result.lowerMinor = safe(BigInt(center) - BigInt(spread));
    result.upperMinor = safe(BigInt(center) + BigInt(spread));
    const distance = BigInt(current.revenueMinor) - BigInt(center);
    result.distanceBps = safe(((distance < 0n ? -distance : distance) * 10000n) / BigInt(spread));
    result.status =
      current.revenueMinor < result.lowerMinor || current.revenueMinor > result.upperMinor
        ? "triggered"
        : "not_triggered";
    return result;
  });
  return {
    version: "6.2-v1",
    ...Object.fromEntries(
      ["anchor", "startDate", "endDate", "timezone", "currencyCode", "scope"].map((key) => [key, series[key]])
    ),
    evaluations,
    alerts: evaluations.filter((item) => item.status === "triggered"),
    policy:
      "Same-weekday median ± max(4.4478 MAD, 10% absolute median, 1 minor unit); minimum four prior observed same weekdays. Missing days excluded, never zero-filled. Weekly seasonality only; holidays and annual seasonality are not inferred."
  };
}

export function severityFor(alert) {
  if (alert.status !== "triggered")
    return { severity: "INFO", severityReason: "not_triggered_or_insufficient_data", severityVersion: "6.3-v1" };
  const critical =
    alert.type === "sales_outlier"
      ? alert.distanceBps >= 30000
      : alert.measuredBps >= Math.max(alert.thresholdBps * 2, alert.thresholdBps + 1000);
  return {
    severity: critical ? "CRITICAL" : "WARNING",
    severityReason: critical
      ? "at_least_double_threshold_and_ten_points_or_three_anomaly_bands"
      : "triggered_below_critical_cutoff",
    severityVersion: "6.3-v1"
  };
}
