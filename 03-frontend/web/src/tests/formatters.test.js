import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "../lib/formatters.js";

describe("locale-aware formatters", () => {
  it("formats CNY for Arabic, English and Simplified Chinese", () => {
    expect(formatCurrency(561, { locale: "ar" })).toContain("CN¥");
    expect(formatCurrency(561, { locale: "en" })).toContain("CN¥");
    expect(formatCurrency(561, { locale: "zh-CN" })).toContain("¥");
  });

  it("uses each currency's ISO minor-unit precision", () => {
    expect(formatCurrency(12345, { locale: "en", currency: "JPY" })).toMatch(/12,345/);
    expect(formatCurrency(12.345, { locale: "en", currency: "BHD" })).toMatch(/12\.345/);
  });

  it("uses the 0.25 means 25 percent convention", () => {
    expect(formatPercent(0.25, { locale: "en" })).toContain("25");
  });

  it("formats dates in Asia/Shanghai and handles invalid or missing values", () => {
    expect(formatDate("2026-07-16T18:43:00Z", { locale: "en", timezone: "Asia/Shanghai" })).toMatch(/Jul|2026/);
    expect(formatDateTime("bad-date", { locale: "en" })).toBe("—");
    expect(formatNumber(null, { locale: "en" })).toBe("—");
  });
});
