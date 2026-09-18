import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { ExecutiveHomePage } from "../pages/ExecutiveHomePage.jsx";
import { ProfitWaterfall, waterfallRows, costCategories } from "../components/financial/ProfitWaterfall.jsx";
import { ownerCopy } from "../pages/ownerCopy.js";
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
  api.mockResolvedValue(report);
  auth.user.role = "owner";
  auth.user.id = 1;
  restaurant.selectedBranchId = "101";
});
for (const locale of ["ar", "en", "zh-CN"])
  it(`executive home answers four questions and links evidence in ${locale}`, async () => {
    mount(locale);
    const c = ownerCopy[locale];
    for (const key of ["health", "changed", "why", "next"])
      expect(await screen.findByRole("heading", { name: c[key] })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: c.today })).toHaveAttribute("href", "/app/today");
    expect(screen.getByRole("link", { name: c.profit })).toHaveAttribute("href", "/app/profit");
    expect(document.documentElement.dir).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(screen.getByText(c.recorded)).toBeInTheDocument();
    expect(document.getElementById("2026-09-18-e1")).toBeInTheDocument();
  });
it("manager home cannot widen scope and changes in branch/user produce fresh queries", async () => {
  auth.user.role = "branch_manager";
  const view = mount();
  await screen.findByRole("heading", { name: ownerCopy.en.health });
  expect(screen.getByLabelText("Scope")).toBeDisabled();
  expect(api.mock.calls.at(-1)[0]).toContain("scope=branch&branchId=101");
  restaurant.selectedBranchId = "102";
  view.refresh();
  await waitFor(() => expect(api.mock.calls.at(-1)[0]).toContain("branchId=102"));
  const count = api.mock.calls.length;
  auth.user.id = 2;
  view.refresh();
  await waitFor(() => expect(api.mock.calls.length).toBeGreaterThan(count));
});
it("home handles failed requests with retry and never invents totals", async () => {
  api.mockRejectedValueOnce({ status: 403 });
  mount();
  expect(await screen.findByText("Permission required")).toBeInTheDocument();
  expect(screen.queryByText("SAR 100")).not.toBeInTheDocument();
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
it("mobile navigation gives direct access to home, today, alerts and copilot", () => {
  expect(mobilePriorityItems.map((item) => item.id)).toEqual(["dashboard", "today", "alerts", "assistant"]);
});
it("owner changes scope without putting foreign identifiers into the request", async () => {
  mount();
  await screen.findByRole("heading", { name: ownerCopy.en.health });
  fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "branch" } });
  await waitFor(() => expect(api.mock.calls.at(-1)[0]).toContain("branchId=101"));
  fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "restaurant" } });
  await waitFor(() => expect(api.mock.calls.at(-1)[0]).not.toContain("branchId"));
});
