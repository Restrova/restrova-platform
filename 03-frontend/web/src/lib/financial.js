import { api } from "./api.js";

export function currencyMinorUnitDigits(currencyCode) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: String(currencyCode).toUpperCase()
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function minorToMajor(value, currencyCode = "CNY") {
  return Number.isSafeInteger(value) ? value / 10 ** currencyMinorUnitDigits(currencyCode) : null;
}

export function ratioBps(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) return null;
  const scaled = BigInt(numerator) * 10000n;
  const divisor = BigInt(denominator);
  const sign = scaled < 0n !== divisor < 0n ? -1n : 1n;
  const absoluteScaled = scaled < 0n ? -scaled : scaled;
  const absoluteDivisor = divisor < 0n ? -divisor : divisor;
  return Number(sign * ((absoluteScaled + absoluteDivisor / 2n) / absoluteDivisor));
}

export function buildFinancialDashboardQuery({
  scope,
  restaurantId,
  branchId,
  period = "today",
  comparison = "previous_period"
}) {
  const parameters = new URLSearchParams({ scope, period, comparison });
  if (scope === "restaurant" && restaurantId) parameters.set("restaurantId", restaurantId);
  if (scope === "branch" && branchId) parameters.set("branchId", branchId);
  return parameters.toString();
}

export function getFinancialDashboard(filters) {
  return api(`/financial/dashboard?${buildFinancialDashboardQuery(filters)}`);
}
