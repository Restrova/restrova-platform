import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { DailyReportPage } from "../pages/CopilotPage.jsx";
import { IntegrationPage } from "../pages/IntegrationPage.jsx";
const { api, auth, restaurant } = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { user: { id: 1, role: "owner" }, organization: { id: 1 } },
  restaurant: { selectedRestaurantId: "10", selectedBranchId: "101" }
}));
vi.mock("../lib/api.js", () => ({ api }));
vi.mock("../contexts/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../contexts/RestaurantContext.jsx", () => ({ useRestaurant: () => restaurant }));
const report = {
  period: { fromDate: "2026-08-01", toDate: "2026-08-31" },
  generatedAt: "now",
  dataRevision: { revision: 2 },
  currencyCode: "SAR",
  claims: [],
  content: "Recorded report",
  sources: [],
  topActions: [{ key: "a", branchId: 101, branchName: "Main", recommendedAction: "raise_price", sourceIds: ["e1"] }],
  trend: [{ date: "2026-08-01", revenueMinor: 5000, profitMinor: null, sourceIds: ["e1"] }]
};
function mount(Page = DailyReportPage, locale = "en") {
  localStorage.setItem("locale", locale);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
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
  auth.user.role = "owner";
  api.mockImplementation(async (path) =>
    path.startsWith("/reports/")
      ? report
      : path === "/integrations"
        ? { connectors: [{ id: 1, name: "POS file" }] }
        : { jobs: [] }
  );
});
it("weekly and monthly selections request the proper report and render sourced actions and honest trend gaps", async () => {
  mount();
  await screen.findByText("Recorded report");
  fireEvent.change(screen.getByLabelText("Report type"), { target: { value: "weekly" } });
  await waitFor(() => expect(api.mock.calls.some(([path]) => path.includes("cadence=weekly"))).toBe(true));
  expect(await screen.findByRole("heading", { name: "Top 3 actions" })).toBeInTheDocument();
  expect(screen.getByText("Review item pricing")).toBeInTheDocument();
  expect(screen.getByText("Unavailable: insufficient evidence")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Report type"), { target: { value: "monthly" } });
  await waitFor(() => expect(api.mock.calls.some(([path]) => path.includes("cadence=monthly"))).toBe(true));
});
it("PDF uses print and CSV reauthorizes a pinned displayed period", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {}),
    create = vi.fn(() => "blob:test"),
    revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    }
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    api.mockImplementation(async (path) => (path.startsWith("/reports/export") ? '"metric","value"' : report));
    mount();
    await screen.findByText("Recorded report");
    fireEvent.click(screen.getByRole("button", { name: "Print / save PDF" }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(
      api.mock.calls.some(([path]) => path.includes("fromDate=2026-08-01") && path.includes("toDate=2026-08-31"))
    ).toBe(true);
  } finally {
    print.mockRestore();
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});
for (const [locale, title] of [
  ["ar", "مصادر البيانات"],
  ["en", "Data sources"],
  ["zh-CN", "数据来源"]
])
  it(`connector UI explicitly identifies file mode in ${locale}`, async () => {
    mount(IntegrationPage, locale);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    await screen.findByRole("option", { name: "POS file" });
  });
it("connector creation uses current restaurant scope and does not claim live connectivity", async () => {
  api.mockImplementation(async (path, options) =>
    path === "/integrations"
      ? options?.method
        ? { id: 2 }
        : { connectors: [{ id: 2, name: "POS file" }] }
      : { jobs: [] }
  );
  mount(IntegrationPage);
  fireEvent.change(screen.getByLabelText("Source name"), { target: { value: "POS file" } });
  fireEvent.click(screen.getByRole("button", { name: "Add source" }));
  expect(await screen.findByText(/not connected to an external service/)).toBeInTheDocument();
  expect(
    api.mock.calls.some(
      ([path, options]) =>
        path === "/integrations" && options?.body === JSON.stringify({ name: "POS file", templateKey: "sales" })
    )
  ).toBe(true);
});
it("viewer cannot manage connectors and receives no connector data", () => {
  auth.user.role = "viewer";
  mount(IntegrationPage);
  expect(screen.getByRole("alert")).toHaveTextContent("Only restaurant owners");
  expect(api).not.toHaveBeenCalled();
});
