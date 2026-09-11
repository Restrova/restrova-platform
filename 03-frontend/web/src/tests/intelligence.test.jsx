import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { AlertCenterPage } from "../pages/AlertCenterPage.jsx";
import { ForecastPage } from "../pages/ForecastPage.jsx";
import { intelligenceCopy } from "../pages/intelligenceCopy.js";
const { api, auth, restaurant } = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { user: { id: 1, role: "owner" }, organization: { id: 1, currency: "SAR", timezone: "Asia/Riyadh" } },
  restaurant: {
    selectedRestaurantId: "10",
    selectedBranchId: "101",
    branches: [
      { id: "101", name: "Riyadh" },
      { id: "102", name: "Jeddah" }
    ]
  }
}));
vi.mock("../lib/api.js", () => ({ api }));
vi.mock("../contexts/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../contexts/RestaurantContext.jsx", () => ({ useRestaurant: () => restaurant }));
const prefs = {
  types: ["sales_drop"],
  branchIds: null,
  thresholds: {
    foodCostTargetBps: 3500,
    salesDropBps: 1000,
    profitMarginDropBps: 300,
    refundRateIncreaseBps: 200,
    discountRateIncreaseBps: 300
  },
  frequency: "off",
  channels: [],
  pushToken: "",
  whatsappPhone: "",
  whatsappConsent: false,
  language: "en"
};
const alert = {
  id: 1,
  version: 1,
  status: "open",
  branchId: 101,
  recurrenceCount: 2,
  assignedTo: null,
  snapshot: {
    type: "sales_drop",
    severity: "WARNING",
    branchName: "Riyadh",
    title: "Sales declined",
    suggestedAction: "Review confirmed sales.",
    currencyCode: "SAR",
    measuredBps: 2000,
    thresholdBps: 1000,
    evidence: {
      current: { revenueMinor: 8000, lineage: [{ orderId: "SOURCE-1", lineId: "1" }] },
      comparison: { revenueMinor: 10000 },
      dates: { current: ["2026-08-23"], comparison: ["2026-08-16"] }
    }
  }
};
const forecast = {
  currencyCode: "SAR",
  history: { fromDate: "2026-06-28", toDate: "2026-08-23" },
  totals: { revenueMinor: 70000, grossSalesMinor: 70000, netProfitMinor: 56000 },
  daily: [{ date: "2026-08-25", revenueMinor: 10000, netProfitMinor: 8000, orderCount: 1 }],
  branches: []
};
function mount(Page, locale = "en") {
  localStorage.setItem("locale", locale);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <Page />
      </LocaleProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  api.mockReset();
  auth.user.role = "owner";
  restaurant.selectedBranchId = "101";
  api.mockImplementation(async (path, options = {}) => {
    if (path === "/alerts/preferences") return options.method ? JSON.parse(options.body) : structuredClone(prefs);
    if (path === "/alerts/notifications") return { available: { email: true }, counts: [] };
    if (path === "/alerts/1/history")
      return {
        version: 1,
        events: [{ id: 1, action: "created", created_at: "2026-08-24", detail: {} }],
        assignees: [{ id: 1, name: "Owner" }]
      };
    if (path === "/alerts/1") return { version: 2, updated: true };
    if (path === "/alerts/refresh")
      return { created: 1, evaluations: [{ status: "triggered" }, { status: "insufficient_data" }] };
    if (path.startsWith("/alerts?")) return { items: [structuredClone(alert)], nextBefore: null };
    if (path.startsWith("/forecasts?")) return structuredClone(forecast);
    return {};
  });
});
describe("alert center and forecasts", () => {
  for (const locale of ["ar", "en", "zh-CN"])
    it(`renders alerts with evidence and localized controls in ${locale}`, async () => {
      const copy = intelligenceCopy[locale === "zh-CN" ? "zh" : locale];
      mount(AlertCenterPage, locale);
      expect(await screen.findByRole("heading", { name: copy.title })).toBeInTheDocument();
      expect(await screen.findByText("Riyadh · " + copy.recurrence + ": 2")).toBeInTheDocument();
      fireEvent.click(screen.getByText(copy.evidence));
      expect(screen.getByText("SOURCE-1 · 1")).toBeInTheDocument();
      expect(document.querySelector(".intelligence-page")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    });
  for (const locale of ["ar", "en", "zh-CN"])
    it(`renders forecast horizon and unavailable data in ${locale}`, async () => {
      const copy = intelligenceCopy[locale === "zh-CN" ? "zh" : locale];
      mount(ForecastPage, locale);
      expect(await screen.findByText("2026-08-25")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(copy.horizon), { target: { value: "30" } });
      await waitFor(() => expect(api.mock.calls.some(([path]) => path.includes("horizon=30"))).toBe(true));
      expect((await screen.findAllByText(copy.noData)).length).toBeGreaterThan(0);
    });
  it("resolves with the optimistic version, handles refresh and preserves a failed comment", async () => {
    mount(AlertCenterPage);
    await screen.findByRole("button", { name: "Resolve" });
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/alerts/1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "resolve", version: 1 }) })
      )
    );
    await userEvent.click(screen.getByRole("button", { name: "Evaluate data" }));
    expect(await screen.findByText("Insufficient data: 1")).toBeInTheDocument();
    const details = screen.getByText("Activity history").parentElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await screen.findByRole("option", { name: "Owner" });
    await userEvent.type(screen.getByLabelText("Follow-up comment"), "Keep this note");
    api.mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete");
    expect(screen.getByLabelText("Follow-up comment")).toHaveValue("Keep this note");
  });
  it("viewer cannot mutate incidents and preferences show unavailable channels", async () => {
    auth.user.role = "viewer";
    mount(AlertCenterPage);
    await screen.findByText("Riyadh · Previous occurrences: 2");
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evaluate data" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Alert preferences"));
    expect(await screen.findByLabelText("Device push (Not configured)")).toBeDisabled();
  });
  it("failed list fetch exposes retry and reloads", async () => {
    const impl = api.getMockImplementation();
    let failed = false;
    api.mockImplementation((path, options) => {
      if (path.startsWith("/alerts?") && !failed) {
        failed = true;
        return Promise.reject(Error("offline"));
      }
      return impl(path, options);
    });
    mount(AlertCenterPage);
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Resolve" })).toBeInTheDocument();
  });
});
