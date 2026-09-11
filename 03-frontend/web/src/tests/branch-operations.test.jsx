import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { BranchOperationsPage } from "../pages/BranchOperationsPage.jsx";
import { operationsCopy } from "../pages/operationsCopy.js";

const { getOperations, auth, restaurant } = vi.hoisted(() => ({
  getOperations: vi.fn(),
  auth: { user: { id: 1, role: "owner" }, organization: { id: 1, currency: "SAR", timezone: "Asia/Riyadh" } },
  restaurant: { selectedRestaurantId: "10", selectedBranchId: "101" }
}));
vi.mock("../lib/operations.js", () => ({ getBranchOperations: getOperations }));
vi.mock("../contexts/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../contexts/RestaurantContext.jsx", () => ({ useRestaurant: () => restaurant }));
const totals = {
  grossSalesMinor: 10000,
  revenueMinor: 9000,
  discountsMinor: 1000,
  refundsMinor: 0,
  commissionMinor: 1000,
  revenueAfterCommissionMinor: 8000,
  lineCount: 1,
  orderCount: 1,
  lineage: [{ orderId: "POS-123", lineId: "1" }]
};
const data = {
  currencyCode: "SAR",
  timezone: "Asia/Riyadh",
  scope: "restaurant",
  period: {
    current: { from: "2026-08-17T00:00:00Z", to: "2026-08-23T23:59:59Z" },
    comparison: { from: "2026-08-10T00:00:00Z", to: "2026-08-16T23:59:59Z" }
  },
  scorecards: [
    {
      branchId: 101,
      branchName: "فرع الرياض",
      branchCode: "RUH",
      current: { revenueMinor: 9000, totalCostsMinor: null, netProfitMinor: null, netMarginBps: null },
      comparison: null,
      deltas: {},
      lineage: { current: { sales: [{ sourceReference: "FIN-1" }] } },
      fullPeriodComparable: false
    }
  ],
  sameStore: {
    eligible: [
      {
        branchId: 101,
        branchName: "فرع الرياض",
        current: totals,
        comparison: { ...totals, revenueMinor: 10000 },
        revenueChange: { change: -1000, changeBps: -1000 }
      }
    ],
    excluded: [{ branchId: 102, branchName: "New Branch", reasons: ["opening_date_unknown"] }],
    alignment: { current: ["2026-08-17"], comparison: ["2026-08-10"] },
    revenueChange: { changeBps: -1000 }
  },
  timeAnalysis: {
    totals,
    weekdays: [{ ...totals, key: 1 }],
    hours: [{ ...totals, key: 19 }],
    dayparts: [{ ...totals, key: "dinner" }]
  },
  channels: { totals, groups: [{ ...totals, key: "aggregator" }], aggregators: [{ ...totals, key: "جاهز" }] },
  opportunities: [
    {
      id: "101:falling_sales",
      branchId: 101,
      branchName: "فرع الرياض",
      type: "falling_sales",
      values: { current: 9000, previous: 10000 },
      evidence: { current: totals, comparison: totals }
    }
  ]
};
function Surface() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <BranchOperationsPage />
      </LocaleProvider>
    </QueryClientProvider>
  );
}

describe("branch operations", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "en");
    auth.user.role = "owner";
    restaurant.selectedBranchId = "101";
    getOperations.mockReset().mockResolvedValue(structuredClone(data));
  });

  it.each(["en", "ar", "zh-CN"])("renders sources, missing costs, time and channel views in %s", async (locale) => {
    localStorage.setItem("locale", locale);
    const user = userEvent.setup();
    const copy = operationsCopy[locale];
    render(<Surface />);
    expect(await screen.findByRole("heading", { name: copy.scorecards })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(screen.getAllByText(copy.unavailable).length).toBeGreaterThan(1);
    expect(screen.getByText(copy.reasons.opening_date_unknown, { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("POS-123", { exact: false }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: copy.time, exact: true }));
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.getByText(copy.daypartNames.dinner)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: copy.channels, exact: true }));
    expect(screen.getByText("جاهز")).toBeInTheDocument();
    expect(screen.getByText(copy.channelHelp)).toBeInTheDocument();
  });

  it("locks managers to their assigned branch and refetches when branch context changes", async () => {
    auth.user.role = "branch_manager";
    const view = render(<Surface />);
    await screen.findByRole("heading", { name: "Branch scorecards" });
    expect(getOperations.mock.calls[0][0]).toMatchObject({ scope: "branch", branchId: "101" });
    const select = screen.getByLabelText("Scope");
    expect(within(select).getAllByRole("option")).toHaveLength(1);
    restaurant.selectedBranchId = "102";
    getOperations.mockResolvedValue({
      ...data,
      scorecards: [{ ...data.scorecards[0], branchId: 102, branchName: "New Branch" }],
      sameStore: { ...data.sameStore, eligible: [] },
      opportunities: []
    });
    view.rerender(<Surface />);
    await waitFor(() => expect(getOperations.mock.calls.at(-1)[0]).toMatchObject({ branchId: "102" }));
    await waitFor(() => expect(screen.queryByText("فرع الرياض")).not.toBeInTheDocument());
  });

  it("validates custom dates before requesting data and supports retry after failures", async () => {
    const user = userEvent.setup();
    getOperations.mockRejectedValueOnce(new Error("offline"));
    render(<Surface />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Branch scorecards" });
    await user.selectOptions(screen.getByLabelText("Period"), "custom");
    const calls = getOperations.mock.calls.length;
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-17" } });
    expect(getOperations).toHaveBeenCalledTimes(calls);
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-23" } });
    await waitFor(() =>
      expect(getOperations.mock.calls.at(-1)[0]).toMatchObject({
        period: "custom",
        fromDate: "2026-08-17",
        toDate: "2026-08-23"
      })
    );
  });
});
