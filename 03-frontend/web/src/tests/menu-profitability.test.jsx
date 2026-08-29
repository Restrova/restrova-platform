import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import * as menu from "../lib/menuProfitability.js";
import { rankMenuItems } from "../lib/menuProfitability.js";
import { MenuProfitabilityPage } from "../pages/MenuProfitabilityPage.jsx";

vi.mock("../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({ organization: { currency: "CNY" } })
}));
vi.mock("../contexts/RestaurantContext.jsx", () => ({
  useRestaurant: () => ({ selectedBranchId: "101" })
}));
vi.mock("../lib/menuProfitability.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, getMenuProfitability: vi.fn() };
});

const item = (id, name, classification, profit, margin, revenue, quantity, costChangeMinor = 0) => ({
  id,
  itemCode: `ITEM-${id}`,
  name,
  metrics: {
    contributionProfitMinor: profit,
    contributionMarginBps: margin,
    itemRevenueMinor: revenue,
    quantitySold: quantity,
    quantitySoldMicros: quantity * 1000000
  },
  engineering: { classification },
  costChangeMinor,
  lineage: {
    sales: {
      lineCount: 1,
      lastSaleAt: "2026-08-28T12:00:00.000Z",
      references: [{ sourceId: id, externalOrderId: `ORDER-${id}`, externalLineId: `LINE-${id}` }]
    },
    costs: [{ sourceId: id }]
  }
});

const response = {
  scope: { currencyCode: "CNY", branchId: 101 },
  items: [item(1, "明星菜", "STAR", 9000, 6000, 15000, 20, 100), item(2, "طبق ضعيف", "DOG", 1000, 1000, 10000, 5, 0)],
  excluded: [{ id: 3, reasons: ["effective_cost_records"] }]
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <MenuProfitabilityPage />
      </LocaleProvider>
    </QueryClientProvider>
  );
}

describe("menu profitability UI", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "en");
    vi.clearAllMocks();
    menu.getMenuProfitability.mockResolvedValue(response);
  });

  it("shows decision rankings, classifications, rising costs, and inspectable evidence", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "Menu profitability" })).toBeInTheDocument();
    expect((await screen.findAllByText("明星菜")).length).toBeGreaterThan(0);
    expect(screen.getByText("STAR")).toBeInTheDocument();
    expect(screen.getByText("DOG")).toBeInTheDocument();
    expect(screen.getByText("+CN¥1.00")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Evidence" })[0]);
    expect(screen.getByRole("dialog", { name: "Evidence: 明星菜" })).toBeInTheDocument();
    expect(screen.getByText("ORDER-1 / LINE-1")).toBeInTheDocument();
  });

  it("changes period without widening the selected branch", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("明星菜");
    await user.selectOptions(screen.getByLabelText("Period"), "7");
    await waitFor(() => {
      const filters = menu.getMenuProfitability.mock.calls.at(-1)[0];
      expect(filters.branchId).toBe("101");
      expect(Date.parse(filters.to) - Date.parse(filters.from)).toBe(7 * 86400000);
    });
  });

  it("uses Arabic RTL and explains incomplete empty data", async () => {
    localStorage.setItem("locale", "ar");
    menu.getMenuProfitability.mockResolvedValue({ ...response, items: [], excluded: response.excluded });
    renderPage();
    expect(await screen.findByText("لا توجد بيانات قائمة قابلة للتصنيف")).toBeInTheDocument();
    expect(screen.getByText(/التكلفة الناقصة تُستبعد/)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });

  it("preserves Chinese content and lets keyboard users close evidence with Escape", async () => {
    localStorage.setItem("locale", "zh-CN");
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "菜单盈利能力" })).toBeInTheDocument();
    const trigger = (await screen.findAllByRole("button", { name: "证据" }))[0];
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "证据: 明星菜" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭详情" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows a retryable error state when menu evidence cannot be loaded", async () => {
    menu.getMenuProfitability.mockRejectedValue(Object.assign(new Error("offline"), { status: 503 }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(menu.getMenuProfitability.mock.calls.length).toBeGreaterThan(1));
  });
});

describe("menu profitability ranking", () => {
  it("ranks only evidenced values and identifies cost increases", () => {
    const ranked = rankMenuItems(response.items);
    expect(ranked.mostProfitable.name).toBe("明星菜");
    expect(ranked.leastProfitable.name).toBe("طبق ضعيف");
    expect(ranked.highestRevenue.name).toBe("明星菜");
    expect(ranked.highestVolume.name).toBe("明星菜");
    expect(ranked.worstMargins[0].name).toBe("طبق ضعيف");
    expect(ranked.risingCosts.map((entry) => entry.name)).toEqual(["明星菜"]);
  });
});
