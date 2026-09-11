import { median, safe, weekday } from "./historicalSeriesService.js";
// Rolling-origin errors: each calibration prediction uses strictly earlier observations.
export function predictionInterval(days, point, field) {
  if (point == null)
    return { status: "unavailable", reason: "missing_point_estimate", lower: null, upper: null, sampleCount: 0 };
  const observed = days.filter((day) => day.observed).sort((a, b) => a.date.localeCompare(b.date)),
    errors = [];
  for (let i = 0; i < observed.length; i++) {
    const prior = observed.slice(0, i).filter((day) => weekday(day.date) === weekday(observed[i].date));
    if (prior.length < 4) continue;
    const error = BigInt(observed[i][field]) - BigInt(median(prior.map((day) => day[field])));
    errors.push(safe(error < 0n ? -error : error));
  }
  if (errors.length < 10)
    return {
      status: "unavailable",
      reason: "requires_ten_rolling_origin_errors",
      lower: null,
      upper: null,
      sampleCount: errors.length
    };
  errors.sort((a, b) => a - b);
  const radius = errors[Math.min(errors.length - 1, Math.ceil((errors.length + 1) * 0.8) - 1)];
  return {
    status: "estimated",
    nominalCoverageBps: 8000,
    lower:
      field === "grossSalesMinor"
        ? Math.max(0, safe(BigInt(point) - BigInt(radius)))
        : safe(BigInt(point) - BigInt(radius)),
    upper: safe(BigInt(point) + BigInt(radius)),
    sampleCount: errors.length,
    radiusMinor: radius,
    method: "rolling_origin_absolute_error_quantile",
    limitations: "Empirical 80% band; coverage is not guaranteed under drift, dependence or season changes."
  };
}
