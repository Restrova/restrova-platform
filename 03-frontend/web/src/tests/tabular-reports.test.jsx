import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TabularReports } from "../pages/TabularReports.jsx";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api.js", () => ({ api }));
const report = {
  kind: "financial",
  period: { fromDate: "2026-08-17", toDate: "2026-08-23" },
  currencyCode: "SAR",
  dataRevision: { revision: 4 },
  columns: [
    { key: "current", label: "Current", type: "money_minor" },
    { key: "previous", label: "Previous", type: "money_minor" }
  ],
  rows: [{ key: "revenueMinor", current: 9400, previous: null }],
  digest: "proof-digest",
  sources: { ledger: "synthetic" }
};
function mount(language = "en", canExport = true) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TabularReports scopeKey="tenant:1" scope="restaurant" language={language} canExport={canExport} />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(report);
  URL.createObjectURL = vi.fn(() => "blob:report");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
it("generates on demand without a stray default-scope request and exports the resolved revision", async () => {
  mount();
  expect(api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
  await screen.findByText(/SAR\s+94\.00/);
  expect(api).toHaveBeenCalledTimes(1);
  expect(api.mock.calls[0][0]).toContain("kind=financial&scope=restaurant&language=en");
  api.mockResolvedValue(new Blob(["export"]));
  fireEvent.click(screen.getByRole("button", { name: "Excel" }));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  expect(api.mock.calls[1][0]).toContain("expectedRevision=4");
  expect(api.mock.calls[1][0]).toContain("fromDate=2026-08-17&toDate=2026-08-23");
  expect(api.mock.calls[1][1]).toMatchObject({ responseType: "blob" });
});
it("incomplete dates block submission and changing report filters clears old results", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Report start"), { target: { value: "2026-08-17" } });
  expect(screen.getByRole("button", { name: "Generate report" })).toBeDisabled();
  expect(api).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Report end"), { target: { value: "2026-08-23" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
  await screen.findByText(/SAR\s+94\.00/);
  fireEvent.change(screen.getByLabelText("Detailed report type"), { target: { value: "menu" } });
  expect(screen.queryByRole("button", { name: "Excel" })).not.toBeInTheDocument();
});
it("viewer controls withhold ledger exports and show missing comparisons explicitly", async () => {
  mount("en", false);
  expect(screen.queryByRole("option", { name: "Ledger for downstream accounting" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
  await screen.findByText("Insufficient data");
  expect(screen.queryByRole("button", { name: "CSV" })).not.toBeInTheDocument();
});
for (const [language, title, button] of [
  ["ar", "التقارير التفصيلية والتصدير", "إنشاء التقرير"],
  ["zh", "详细报告与导出", "生成报告"]
])
  it(`localized report controls and failures in ${language}`, async () => {
    api.mockRejectedValue(new Error("offline"));
    mount(language);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: button })).toBeEnabled();
  });
