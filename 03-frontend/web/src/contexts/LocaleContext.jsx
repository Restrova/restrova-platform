import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, directionForLocale, localeMeta, normalizeLocale, translate } from "../app/i18n.js";
import {
  formatCompactNumber as formatCompactNumberValue,
  formatCurrency as formatCurrencyValue,
  formatDate as formatDateValue,
  formatDateTime as formatDateTimeValue,
  formatNumber as formatNumberValue,
  formatPercent as formatPercentValue
} from "../lib/formatters.js";

const LOCALE_KEY = "locale";
const LocaleContext = createContext(null);

function getInitialLocale() {
  return normalizeLocale(localStorage.getItem(LOCALE_KEY) || DEFAULT_LOCALE);
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialLocale);
  const direction = directionForLocale(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    localStorage.setItem(LOCALE_KEY, locale);
  }, [direction, locale]);

  const setLocale = useCallback((nextLocale) => {
    setLocaleState(normalizeLocale(nextLocale));
  }, []);

  const t = useCallback((key) => translate(locale, key), [locale]);

  const formatterOptions = useCallback((options = {}) => ({ locale, ...options }), [locale]);

  const value = useMemo(() => ({
    locale,
    direction,
    locales: localeMeta,
    setLocale,
    t,
    formatNumber: (valueToFormat, options) => formatNumberValue(valueToFormat, formatterOptions(options)),
    formatCurrency: (valueToFormat, options) => formatCurrencyValue(valueToFormat, formatterOptions(options)),
    formatPercent: (valueToFormat, options) => formatPercentValue(valueToFormat, formatterOptions(options)),
    formatDate: (valueToFormat, options) => formatDateValue(valueToFormat, formatterOptions(options)),
    formatDateTime: (valueToFormat, options) => formatDateTimeValue(valueToFormat, formatterOptions(options)),
    formatCompactNumber: (valueToFormat, options) => formatCompactNumberValue(valueToFormat, formatterOptions(options))
  }), [direction, formatterOptions, locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
