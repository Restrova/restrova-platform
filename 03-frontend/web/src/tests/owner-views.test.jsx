import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { ExecutiveHomePage } from "../pages/ExecutiveHomePage.jsx";
import { ProfitWaterfall, waterfallRows, costCategories } from "../components/financial/ProfitWaterfall.jsx";
import { simpleCopy } from "../pages/simpleCopy.js";
import { mobilePriorityItems } from "../app/navigation.js";
const { api, auth, restaurant } = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { user: { id: 1, role: "owner" }, organization: { id: 1 } },
  restaurant: { selectedRestaurantId: "10", selectedBranchId: "101" }
}));
vi.mock("../lib/api.js", () => ({ api }));
vi.mock("../contexts/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../contexts/RestaurantContext.jsx", () => ({ useRestaurant: () => restaurant }));
const report = {
  period: { fromDate: "2026-09-17", toDate: "2026-09-17" },
  generatedAt: "2026-09-18",
  dataRevision: { revision: 2 },
  currencyCode: "SAR",
  claims: [
    {
      key: "revenue",
      label: "Recorded revenue",
      text: "Recorded revenue: SAR 100",
      status: "supported",
      sourceIds: ["e1"]
    }
  ],
  sources: [
    {
      id: "e1",
      period: { fromDate: "2026-09-17", toDate: "2026-09-17" },
      url: "/app/profit",
      data: { source: "confirmed import" }
    }
  ],
  executiveSummary: [{ text: "No verified comparison yet.", sourceIds: ["e1"] }],
  topActions: [],
  trend: []
};
function mount(locale = "en") {
  localStorage.setItem("locale", locale);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LocaleProvider>
          <ExecutiveHomePage />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(tree());
  return { ...result, refresh: () => result.rerender(tree()), client };
}
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path) => (path.startsWith("/experience") ? structuredClone(overview) : report));
  auth.user.role = "owner";
  auth.user.id = 1;
  restaurant.selectedBranchId = "101";
});
const overview = {
  hasData: true,
  date: "2026-09-28",
  timezone: "Asia/Riyadh",
  currencyCode: "SAR",
  today: { source: "import", revenueMinor: 125000, profitMinor: null, orders: 18 },
  status: { costs: { count: 0 } }
};
for (const locale of ["ar", "en", "zh-CN"])
  it(`home shows three honest metrics, one chart and one insight in ${locale}`, async () => {
    mount(locale);
    const c = simpleCopy[locale];
    expect(await screen.findByRole("heading", { name: c.home })).toBeInTheDocument();
    expect(document.querySelectorAll(".simple-kpi")).toHaveLength(3);
    expect(screen.getByRole("link", { name: new RegExp(c.profit) })).toHaveTextContent(c.unknown);
    expect(screen.getByRole("link", { name: c.ask })).toHaveAttribute("href", "/app/assistant");
    expect(screen.getByRole("heading", { name: c.trend })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: c.insight })).toBeInTheDocument();
    expect(document.querySelectorAll(".rivo-insight img, img.rivo-insight")).toHaveLength(1);
    expect(document.documentElement.dir).toBe(locale === "ar" ? "rtl" : "ltr");
  });
it("header branch and account changes produce fresh scoped home requests", async () => {
  auth.user.role = "branch_manager";
  const view = mount();
  await screen.findByRole("heading", { name: simpleCopy.en.home });
  expect(api.mock.calls.some(([p]) => p.includes("branchId=101"))).toBe(true);
  restaurant.selectedBranchId = "102";
  view.refresh();
  await waitFor(() => expect(api.mock.calls.some(([p]) => p.includes("branchId=102"))).toBe(true));
  const count = api.mock.calls.length;
  auth.user.id = 2;
  view.refresh();
  await waitFor(() => expect(api.mock.calls.length).toBeGreaterThan(count));
});
it("home handles failed requests with retry and never invents totals", async () => {
  api.mockRejectedValueOnce({ status: 403 });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(simpleCopy.en.error);
  expect(screen.getByRole("button", { name: simpleCopy.en.retry })).toBeEnabled();
  expect(document.querySelectorAll(".simple-kpi")).toHaveLength(0);
});
it("waterfall reconciles refunds and losses; missing inputs never imply zero profit", () => {
  const summary = {
    revenue: { grossSalesMinor: 10000, discountsMinor: 500, refundsMinor: 1000 },
    costs: Object.fromEntries(costCategories.map(([key]) => [key, 2000])),
    profit: { netProfitMinor: -7500 },
    completeness: {
      hasData: true,
      presentCategories: ["sales", "discounts", "refunds", ...costCategories.map(([, key]) => key)],
      missingCategories: []
    }
  };
  expect(waterfallRows(summary).at(-1).end).toBe(-7500);
  summary.completeness.presentCategories = summary.completeness.presentCategories.filter((c) => c !== "rent");
  summary.completeness.missingCategories = ["rent"];
  expect(waterfallRows(summary).at(-1).end).toBeNull();
  render(<ProfitWaterfall summary={summary} money={(v) => `SAR ${v}`} t={(v) => v} locale="en" />);
  expect(screen.getByRole("status")).toHaveTextContent("More complete data");
  expect(screen.queryByText("SAR -7500")).not.toBeInTheDocument();
});
it("mobile navigation gives direct access to exactly home, AI, data and settings", () => {
  expect(mobilePriorityItems.map((item) => item.id)).toEqual(["dashboard", "assistant", "data", "settings"]);
});
it("first visit offers connect and upload before an empty dashboard", async () => {
  api.mockResolvedValue({ ...overview, hasData: false });
  mount();
  expect(await screen.findByRole("heading", { name: /Welcome/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: simpleCopy.en.connect })).toHaveAttribute("href", "/app/integrations");
  expect(document.querySelectorAll(".simple-kpi")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: simpleCopy.en.later }));
  expect(await screen.findByRole("heading", { name: simpleCopy.en.home })).toBeInTheDocument();
});
