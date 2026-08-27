import { DEFAULT_LOCALE, normalizeLocale } from "../app/i18n.js";

export const FALLBACK_DISPLAY = "—";
export const DEFAULT_CURRENCY = "CNY";
export const DEFAULT_TIMEZONE = "Asia/Shanghai";

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function toNumber(value) {
  if (isMissing(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeFormat(callback) {
  try {
    return callback();
  } catch {
    return FALLBACK_DISPLAY;
  }
}

export function formatNumber(value, { locale = DEFAULT_LOCALE, fallback = FALLBACK_DISPLAY, ...options } = {}) {
  const number = toNumber(value);
  if (number === null) return fallback;
  return safeFormat(() => new Intl.NumberFormat(normalizeLocale(locale), options).format(number));
}

export function formatCurrency(
  value,
  { locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY, fallback = FALLBACK_DISPLAY, ...options } = {}
) {
  const number = toNumber(value);
  if (number === null) return fallback;
  return safeFormat(() =>
    new Intl.NumberFormat(normalizeLocale(locale), {
      style: "currency",
      currency,
      ...options
    }).format(number)
  );
}

export function formatPercent(value, { locale = DEFAULT_LOCALE, fallback = FALLBACK_DISPLAY, ...options } = {}) {
  const number = toNumber(value);
  if (number === null) return fallback;
  return safeFormat(() =>
    new Intl.NumberFormat(normalizeLocale(locale), {
      style: "percent",
      maximumFractionDigits: 1,
      ...options
    }).format(number)
  );
}

export function formatCompactNumber(value, { locale = DEFAULT_LOCALE, fallback = FALLBACK_DISPLAY, ...options } = {}) {
  const number = toNumber(value);
  if (number === null) return fallback;
  return safeFormat(() =>
    new Intl.NumberFormat(normalizeLocale(locale), {
      notation: "compact",
      maximumFractionDigits: 1,
      ...options
    }).format(number)
  );
}

export function formatDate(
  value,
  { locale = DEFAULT_LOCALE, timezone = DEFAULT_TIMEZONE, fallback = FALLBACK_DISPLAY, ...options } = {}
) {
  if (isMissing(value)) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return safeFormat(() =>
    new Intl.DateTimeFormat(normalizeLocale(locale), {
      timeZone: timezone,
      dateStyle: "medium",
      ...options
    }).format(date)
  );
}

export function formatDateTime(
  value,
  { locale = DEFAULT_LOCALE, timezone = DEFAULT_TIMEZONE, fallback = FALLBACK_DISPLAY, ...options } = {}
) {
  if (isMissing(value)) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return safeFormat(() =>
    new Intl.DateTimeFormat(normalizeLocale(locale), {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
      ...options
    }).format(date)
  );
}
