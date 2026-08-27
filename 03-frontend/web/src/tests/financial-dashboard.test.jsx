import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { buildFinancialDashboardQuery, currencyMinorUnitDigits, minorToMajor, ratioBps } from "../lib/financial.js";
import * as financial from "../lib/financial.js";
import { FinancialDashboardPage } from "../pages/FinancialDashboardPage.jsx";

const { authMock, restaurantMock } = vi.hoisted(() => ({
  authMock: {
    user: { id: 1, email: "owner@example.test", role: "owner" },
    organization: { currency: "CNY" }
  },
  restaurantMock: {
    selectedRestaurantId: "10",
    selectedBranchId: "101"
  }
}));

vi.mock("../contexts/AuthContext.jsx", () => ({ useAuth: () => authMock }));
vi.mock("../contexts/RestaurantContext.jsx", () => ({ useRestaurant: () => restaurantMock }));
vi.mock("../lib/financial.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, getFinancialDashboard: vi.fn() };
});

const lineage = {
  sales: [
    {
      sourceType: "import",
      sourceReference: "POS-SALE-1",
      restaurantId: 10,
      branchId: 101
    }
  ],
  discounts: [],
  refunds: [],
  food_costs: [{ sourceType: "import", sourceReference: "FOOD-1", restaurantId: 10, branchId: 101 }],
  packaging: [],
  delivery_commissions: [],
  labor: [{ sourceType: "import", sourceReference: "LABOR-1", restaurantId: 10, branchId: 101 }],
  rent: [],
  utilities: [],
  marketing: [],
  miscellaneous_operating_expenses: []
};

const completeness = {
  hasData: true,
  entryCount: 3,
  presentCategories: ["sales", "food_costs", "labor"],
  missingCategories: [
    "discounts",
    "refunds",
    "packaging",
    "delivery_commissions",
    "rent",
    "utilities",
    "marketing",
    "miscellaneous_operating_expenses"
  ]
};

const dashboard = {
  dashboardVersion: "3.5-v1",
  scope: "organization",
  currencyCode: "CNY",
  timezone: "Asia/Shanghai",
  period: {
    key: "today",
    from: "2026-08-26T16:00:00.000Z",
    to: "2026-08-27T15:59:59.999Z"
  },
  summary: {
    revenue: { grossSalesMinor: 17000, discountsMinor: 0, refundsMinor: 0, revenueMinor: 17000 },
    costs: {
      foodCostsMinor: 3000,
      packagingCostsMinor: 500,
      deliveryCommissionsMinor: 1000,
      laborCostsMinor: 2000,
      rentCostsMinor: 1000,
      utilitiesCostsMinor: 500,
      marketingCostsMinor: 250,
      miscellaneousOperatingExpensesMinor: 250,
      totalCostsMinor: 8500
    },
    profit: {
      grossProfitMinor: 14000,
      contributionProfitMinor: 12500,
      operatingProfitMinor: 8500,
      netProfitMinor: 8500
    },
    marginsBps: { grossMarginBps: 8235, contributionMarginBps: 7353, netMarginBps: 5000 },
    orders: { orderCount: 2, averageOrderValueMinor: 8500, costPerOrderMinor: 4250 },
    completeness,
    lineage
  },
  comparison: {
    metrics: { revenueMinor: 15000, netProfitMinor: 7500, netMarginBps: 4700 },
    changes: {
      revenueMinor: 2000,
      netProfitMinor: 1000,
      netMarginBps: 300,
      averageOrderValueMinor: 500,
      orderCount: 1
    },
    completeness,
    lineage
  },
  trends: {
    granularity: "hour",
    step: 1,
    points: [
      {
        label: "08:00",
        from: "2026-08-27T00:00:00.000Z",
        metrics: { revenueMinor: 8000, netProfitMinor: 3000 },
        completeness,
        lineage
      },
      {
        label: "12:00",
        from: "2026-08-27T04:00:00.000Z",
        metrics: { revenueMinor: 9000, netProfitMinor: 5500 },
        completeness,
        lineage
      }
    ]
  },
  branchRanking: {
    metric: "netProfitMinor",
    unallocatedCostsExcluded: true,
    items: [
      {
        rank: 1,
        branchId: 101,
        branchName: "深圳总店",
        branchCode: "MAIN",
        city: "Shenzhen",
        metrics: { revenueMinor: 10000, netProfitMinor: 6000, netMarginBps: 6000 },
        completeness,
        lineage
      }
    ]
  },
  reconciliation: { current: { reconciled: true }, comparison: { reconciled: true } },
  assumptions: []
};

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <FinancialDashboardPage />
      </LocaleProvider>
    </QueryClientProvider>
  );
}

describe("financial dashboard", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "en");
    authMock.user.role = "owner";
    vi.clearAllMocks();
    financial.getFinancialDashboard.mockResolvedValue(dashboard);
  });

  it("renders source-backed financial metrics, trends, costs, and branch ranking", async () => {
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Financial performance" })).toBeInTheDocument();
    expect(await screen.findByText("CN¥170.00")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("深圳总店")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Revenue and profit trend/ })).toBeInTheDocument();
    expect(screen.getByText(/ledger entries/i)).toBeInTheDocument();
    expect(financial.getFinancialDashboard).toHaveBeenCalledWith({
      scope: "organization",
      restaurantId: "10",
      branchId: "101",
      period: "today",
      comparison: "previous_period"
    });
  });

  it("requests the selected branch, period, and comparison without widening scope", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("深圳总店");

    await user.selectOptions(screen.getByLabelText("Scope"), "branch");
    await user.selectOptions(screen.getByLabelText("Period"), "month");
    await user.selectOptions(screen.getByLabelText("Comparison"), "previous_year");

    await waitFor(() =>
      expect(financial.getFinancialDashboard).toHaveBeenLastCalledWith({
        scope: "branch",
        restaurantId: "10",
        branchId: "101",
        period: "month",
        comparison: "previous_year"
      })
    );
  });

  it("shows an explicit empty state instead of inventing figures", async () => {
    financial.getFinancialDashboard.mockResolvedValue({
      ...dashboard,
      summary: {
        ...dashboard.summary,
        completeness: { ...completeness, hasData: false, entryCount: 0 }
      }
    });
    renderDashboard();

    expect(await screen.findByText("No financial data for this period")).toBeInTheDocument();
    expect(screen.queryByText("¥0.00")).not.toBeInTheDocument();
  });

  it("shows permission failures and supports Arabic RTL content", async () => {
    localStorage.setItem("locale", "ar");
    financial.getFinancialDashboard.mockRejectedValue({ status: 403 });
    renderDashboard();

    expect(await screen.findByText("تحتاج إلى صلاحية")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });
});

describe("financial dashboard helpers", () => {
  it("converts safe integer minor units and rounds ratios deterministically", () => {
    expect(minorToMajor(12345)).toBe(123.45);
    expect(minorToMajor(12345, "JPY")).toBe(12345);
    expect(minorToMajor(12345, "BHD")).toBe(12.345);
    expect(currencyMinorUnitDigits("CNY")).toBe(2);
    expect(currencyMinorUnitDigits("JPY")).toBe(0);
    expect(currencyMinorUnitDigits("BHD")).toBe(3);
    expect(minorToMajor(1.5)).toBeNull();
    expect(ratioBps(1, 6)).toBe(1667);
    expect(ratioBps(-1, 6)).toBe(-1667);
    expect(ratioBps(1, 0)).toBeNull();
    expect(ratioBps(1, -1)).toBeNull();
  });

  it("includes only identifiers permitted by the selected scope", () => {
    expect(
      buildFinancialDashboardQuery({
        scope: "branch",
        restaurantId: "10",
        branchId: "101",
        period: "month",
        comparison: "previous_year"
      })
    ).toBe("scope=branch&period=month&comparison=previous_year&branchId=101");
    expect(
      buildFinancialDashboardQuery({
        scope: "organization",
        restaurantId: "10",
        branchId: "101"
      })
    ).toBe("scope=organization&period=today&comparison=previous_period");
  });
});
