import { validationError } from "../errors/appError.js";
import { financialPeriodQuerySchema, validate } from "../validation/schemas.js";
import { calculateFinancialMetrics } from "./financialService.js";

const millisecond = 1;

function localParts(date, timezone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
  } catch {
    throw validationError("The organization timezone is invalid.");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function normalizeLocal(parts) {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0)
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
}

function addLocal(parts, { days = 0, months = 0, years = 0 }) {
  return normalizeLocal({
    ...parts,
    year: parts.year + years,
    month: parts.month + months,
    day: parts.day + days
  });
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftLocalYear(parts, years) {
  const year = parts.year + years;
  return { ...parts, year, day: Math.min(parts.day, daysInMonth(year, parts.month)) };
}

function localToInstant(parts, timezone) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = localParts(new Date(guess), timezone);
    const observedWallTime = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    const difference = target - observedWallTime;
    guess += difference;
    if (difference === 0) break;
  }
  return new Date(guess);
}

function startOfPreset(preset, anchorLocal) {
  const day = { year: anchorLocal.year, month: anchorLocal.month, day: anchorLocal.day };
  if (preset === "today") return normalizeLocal(day);
  if (preset === "yesterday") return addLocal(day, { days: -1 });
  if (preset === "week") {
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    return addLocal(day, { days: -((weekday + 6) % 7) });
  }
  if (preset === "month") return normalizeLocal({ ...day, day: 1 });
  if (preset === "quarter") {
    return normalizeLocal({ year: day.year, month: Math.floor((day.month - 1) / 3) * 3 + 1, day: 1 });
  }
  return normalizeLocal({ year: day.year, month: 1, day: 1 });
}

function nextPresetStart(preset, start) {
  if (preset === "today" || preset === "yesterday") return addLocal(start, { days: 1 });
  if (preset === "week") return addLocal(start, { days: 7 });
  if (preset === "month") return addLocal(start, { months: 1 });
  if (preset === "quarter") return addLocal(start, { months: 3 });
  return addLocal(start, { years: 1 });
}

function previousPresetStart(preset, start) {
  if (preset === "today" || preset === "yesterday") return addLocal(start, { days: -1 });
  if (preset === "week") return addLocal(start, { days: -7 });
  if (preset === "month") return addLocal(start, { months: -1 });
  if (preset === "quarter") return addLocal(start, { months: -3 });
  return addLocal(start, { years: -1 });
}

function inclusiveRange(start, next) {
  return {
    from: start.toISOString(),
    to: new Date(next.getTime() - millisecond).toISOString()
  };
}

function presetRange(preset, anchor, timezone) {
  const startLocal = startOfPreset(preset, localParts(anchor, timezone));
  const nextLocal = nextPresetStart(preset, startLocal);
  return {
    ...inclusiveRange(localToInstant(startLocal, timezone), localToInstant(nextLocal, timezone)),
    startLocal,
    nextLocal
  };
}

function shiftCustomYear(date, timezone) {
  return localToInstant(shiftLocalYear(localParts(date, timezone), -1), timezone);
}

function comparisonRange(parsed, current, timezone) {
  if (parsed.comparison === "none") return null;
  if (parsed.period === "custom") {
    const start = new Date(current.from);
    const end = new Date(current.to);
    if (parsed.comparison === "previous_period") {
      const duration = end.getTime() - start.getTime() + millisecond;
      const previousEnd = new Date(start.getTime() - millisecond);
      return {
        from: new Date(previousEnd.getTime() - duration + millisecond).toISOString(),
        to: previousEnd.toISOString()
      };
    }
    if (parsed.comparison === "same_weekday") {
      return {
        from: new Date(start.getTime() - 7 * 86400000).toISOString(),
        to: new Date(end.getTime() - 7 * 86400000).toISOString()
      };
    }
    return {
      from: shiftCustomYear(start, timezone).toISOString(),
      to: shiftCustomYear(end, timezone).toISOString()
    };
  }

  let comparisonStart;
  let comparisonNext;
  if (parsed.comparison === "previous_period") {
    comparisonStart = previousPresetStart(parsed.period, current.startLocal);
    comparisonNext = current.startLocal;
  } else if (parsed.comparison === "same_weekday") {
    comparisonStart = addLocal(current.startLocal, { days: -7 });
    comparisonNext = addLocal(current.nextLocal, { days: -7 });
  } else {
    comparisonStart = shiftLocalYear(current.startLocal, -1);
    comparisonNext = shiftLocalYear(current.nextLocal, -1);
  }
  return inclusiveRange(localToInstant(comparisonStart, timezone), localToInstant(comparisonNext, timezone));
}

export function financialMetricChanges(current, comparison) {
  if (!comparison) return null;
  return Object.fromEntries(
    Object.entries(current.metrics).map(([key, value]) => [
      key,
      typeof value === "number" && typeof comparison.metrics[key] === "number" ? value - comparison.metrics[key] : null
    ])
  );
}

export function resolveFinancialPeriodRanges(query, timezone) {
  const parsed = validate(financialPeriodQuerySchema, query);
  if (parsed.period === "custom" && (!parsed.from || !parsed.to)) {
    throw validationError("Custom financial periods require both from and to.");
  }
  if (parsed.period !== "custom" && (parsed.from || parsed.to)) {
    throw validationError("from and to are only valid for a custom financial period.");
  }
  if (parsed.from && new Date(parsed.from) > new Date(parsed.to)) {
    throw validationError("Financial period start must not be after its end.");
  }
  if (parsed.comparison === "same_weekday" && !["today", "yesterday"].includes(parsed.period)) {
    throw validationError("Same-weekday comparison requires today or yesterday.");
  }

  const anchor = parsed.anchor ? new Date(parsed.anchor) : new Date();
  localParts(anchor, timezone);
  const resolvedCurrent =
    parsed.period === "custom"
      ? { from: new Date(parsed.from).toISOString(), to: new Date(parsed.to).toISOString() }
      : presetRange(parsed.period, anchor, timezone);
  const comparison = comparisonRange(parsed, resolvedCurrent, timezone);
  return {
    preset: parsed.period,
    comparisonKind: parsed.comparison,
    timezone,
    anchor: anchor.toISOString(),
    current: { from: resolvedCurrent.from, to: resolvedCurrent.to },
    comparison
  };
}

export function resolveFinancialDateRange(date, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw validationError("Use a YYYY-MM-DD date.");
  const [year, month, day] = date.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw validationError("Invalid calendar date.");
  }
  return resolveFinancialPeriodRanges(
    {
      period: "today",
      comparison: "none",
      anchor: localToInstant({ year, month, day, hour: 12 }, timezone).toISOString()
    },
    timezone
  );
}

export function calculateFinancialPeriod(user, query) {
  const timezone = user.timezone;
  const ranges = resolveFinancialPeriodRanges(query, timezone);
  const calculationScope = { branchId: query.branchId };
  const currentCalculation = calculateFinancialMetrics(user, {
    ...calculationScope,
    from: ranges.current.from,
    to: ranges.current.to
  });
  const comparisonCalculation = ranges.comparison
    ? calculateFinancialMetrics(user, {
        ...calculationScope,
        from: ranges.comparison.from,
        to: ranges.comparison.to
      })
    : null;

  return {
    periodVersion: "3.3-v1",
    preset: ranges.preset,
    comparisonKind: ranges.comparisonKind,
    timezone: ranges.timezone,
    anchor: ranges.anchor,
    current: currentCalculation,
    comparison: comparisonCalculation,
    changes: financialMetricChanges(currentCalculation, comparisonCalculation)
  };
}
