import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { dictionaries } from "../app/i18n.js";
import { simpleCopy } from "../pages/simpleCopy.js";
import { ownerCopy } from "../pages/ownerCopy.js";
import { operationsCopy } from "../pages/operationsCopy.js";
import { copilotUiCopy } from "../pages/copilotUiCopy.js";
import { decisionCopy, actionCopy } from "../pages/decisionCopy.js";
import { integrationCopy } from "../pages/integrationCopy.js";
import { intelligenceCopy } from "../pages/intelligenceCopy.js";
import { workspaceCopy } from "../components/legacy/workspaceCopy.js";
import { SettingsPage, DataPage } from "../pages/SimplePages.jsx";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api.js", () => ({ api }));
vi.mock("../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Khaled", email: "owner@example.test", role: "owner" },
    organization: { id: 1 }
  })
}));
vi.mock("../contexts/RestaurantContext.jsx", () => ({
  useRestaurant: () => ({ selectedRestaurantId: "10", selectedBranchId: "101" })
}));
function leaves(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) =>
    typeof value === "object" ? leaves(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
  );
}
for (const [name, copy] of Object.entries({
  dictionaries,
  simpleCopy,
  ownerCopy,
  operationsCopy,
  copilotUiCopy,
  decisionCopy,
  actionCopy,
  integrationCopy,
  intelligenceCopy,
  workspaceCopy
})) {
  for (const locale of ["ar", "zh-CN"]) {
    it(`${name} has complete, nonempty ${locale} translations`, () => {
      const translated = leaves(copy[locale] || copy[locale === "zh-CN" ? "zh" : locale]);
      expect(translated.map(([key]) => key).sort()).toEqual(
        leaves(copy.en)
          .map(([key]) => key)
          .sort()
      );
      for (const [, value] of translated) expect(value.trim()).not.toBe("");
    });
  }
}
function mount(Page, locale, entry = "/app/settings") {
  localStorage.setItem("locale", locale);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <LocaleProvider>
          <Page />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  api.mockReset();
});
for (const locale of ["ar", "en", "zh-CN"]) {
  it(`settings supports keyboard tabs and localized role in ${locale}`, async () => {
    mount(SettingsPage, locale);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    tabs[0].focus();
    await userEvent.keyboard(locale === "ar" ? "{ArrowLeft}" : "{ArrowRight}");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(tabs.at(-1)).toHaveFocus();
    expect(screen.getByText(dictionaries[locale].team.roles.owner)).toBeInTheDocument();
    expect(screen.getByText("owner@example.test").tagName).toBe("BDI");
    await userEvent.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
  });
  it(`data timestamps use restaurant timezone and ${locale} formatting`, async () => {
    const timestamp = "2026-10-04T00:00:00Z";
    api.mockResolvedValue({
      timezone: "Asia/Shanghai",
      status: Object.fromEntries(["sales", "orders", "costs"].map((key) => [key, { count: 1, updatedAt: timestamp }])),
      coverage: {}
    });
    mount(DataPage, locale);
    const expected = new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Shanghai",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(timestamp));
    expect(await screen.findAllByText(expected)).toHaveLength(3);
    expect(screen.queryByText(timestamp)).not.toBeInTheDocument();
  });
}
