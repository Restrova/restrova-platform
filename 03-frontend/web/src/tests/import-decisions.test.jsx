import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RecommendationsPage } from "../pages/RecommendationsPage.jsx";
import { decisionCopy } from "../pages/decisionCopy.js";
import { ImportDataBridge } from "../components/ImportDataBridge.jsx";
import { announceDataChange } from "../lib/dataRefresh.js";
const { api, auth, restaurant } = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { user: { id: 1, role: "owner" }, organization: { id: 1 }, refreshDataSession: vi.fn() },
  restaurant: { selectedRestaurantId: "10", selectedBranchId: "101" }
}));
vi.mock("../lib/api.js", () => ({ api }));
vi.mock("../contexts/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../contexts/RestaurantContext.jsx", () => ({ useRestaurant: () => restaurant }));
const proposal = {
  key: "menu:1",
  category: "menu",
  item: { name: "Mandi", itemCode: "ITEM" },
  recommendedAction: "promote_item",
  problem: "high_popularity_high_margin",
  period: { fromDate: "2026-08-01", toDate: "2026-08-07" },
  evidence: { itemRevenueMinor: 10000 },
  lineage: { sales: [{ orderId: "SOURCE-1" }] },
  confidence: { level: "high" }
};
const decision = {
  scope: { fromDate: "2026-08-01", toDate: "2026-08-07" },
  dataRevision: { revision: 3 },
  recommendations: [proposal]
};
function mount(Page = RecommendationsPage, locale = "en") {
  localStorage.setItem("locale", locale);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LocaleProvider>
            <Page />
          </LocaleProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  };
}
beforeEach(() => {
  localStorage.clear();
  api.mockReset();
  auth.refreshDataSession.mockReset();
  auth.user.role = "owner";
  api.mockImplementation(async (path, options) =>
    path.startsWith("/decisions/actions") ? (options?.method ? { id: 1 } : { actions: [] }) : structuredClone(decision)
  );
});
describe("import-connected decisions", () => {
  for (const locale of ["ar", "en", "zh-CN"])
    it(`renders evidence and import entry in ${locale}`, async () => {
      const c = decisionCopy[locale === "zh-CN" ? "zh" : locale];
      mount(RecommendationsPage, locale);
      expect(await screen.findByRole("heading", { name: "Mandi" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: c.imports })).toHaveAttribute("href", "/app/imports");
      expect(screen.getByText(/SOURCE-1/)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: c.title }).closest("section")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr"
      );
    });
  it("records the displayed branch and evidence period; viewer cannot approve", async () => {
    const view = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Save for follow-up" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/decisions/actions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ branchId: 101, ...proposal.period, key: proposal.key })
        })
      )
    );
    view.unmount();
    auth.user.role = "viewer";
    mount();
    await screen.findByRole("heading", { name: "Mandi" });
    expect(screen.queryByRole("button", { name: "Save for follow-up" })).not.toBeInTheDocument();
  });
  it("refreshes every cached analysis after a matching import, preserves tenant isolation and refreshes branch context", async () => {
    const { client } = mount(ImportDataBridge);
    client.setQueryData(["forecast", 1], { revenue: 10 });
    client.setQueryData(["decisions", 1], { items: [] });
    announceDataChange({ organizationId: 2, restaurantId: 20, revision: 4 });
    expect(client.getQueryState(["forecast", 1]).isInvalidated).toBe(false);
    announceDataChange({ organizationId: 1, restaurantId: 10, revision: 4 });
    await waitFor(() => expect(client.getQueryState(["forecast", 1]).isInvalidated).toBe(true));
    expect(client.getQueryState(["decisions", 1]).isInvalidated).toBe(true);
    expect(auth.refreshDataSession).toHaveBeenCalledTimes(1);
  });
  it("shows empty imports guidance and a recoverable failure", async () => {
    api.mockResolvedValue({ scope: decision.scope, dataRevision: { revision: 0 }, recommendations: [], actions: [] });
    const view = mount();
    expect(await screen.findByText(decisionCopy.en.empty)).toBeInTheDocument();
    view.unmount();
    api.mockRejectedValue(new Error("test failure"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(decisionCopy.en.error);
  });
});
