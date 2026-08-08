import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider, useLocale } from "../contexts/LocaleContext.jsx";
import { translate } from "../app/i18n.js";

function wrapper({ children }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

describe("LocaleProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
    document.documentElement.dir = "";
  });

  it("defaults to Arabic and sets rtl", () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe("ar");
    expect(result.current.direction).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("switches English and Chinese to ltr without reload", () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    act(() => result.current.setLocale("en"));
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("locale")).toBe("en");

    act(() => result.current.setLocale("zh-CN"));
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("falls back safely for invalid locale and missing translation keys", () => {
    localStorage.setItem("locale", "xx");
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe("ar");
    expect(translate("ar", "missing.key")).toBe("missing.key");
    expect(result.current.t("common.confirm")).toBe("تأكيد");
  });
});
