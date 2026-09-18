import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { CopilotPage, DailyReportPage } from "../pages/CopilotPage.jsx";
import { copilotUiCopy } from "../pages/copilotUiCopy.js";
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
const answer = {
  period: { fromDate: "2026-09-14", toDate: "2026-09-14" },
  generatedAt: "2026-09-15T00:00:00Z",
  dataRevision: { revision: 1 },
  claims: [{ key: "profit", label: "Profit", text: "Profit: 30 SAR", status: "supported", sourceIds: ["e1"] }],
  executiveSummary: [{ text: "Documented change explanation", sourceIds: ["e1"] }],
  sources: [
    {
      id: "e1",
      digest: "hash",
      period: { fromDate: "2026-09-14", toDate: "2026-09-14" },
      url: "/app/dashboard",
      evidenceUrl: "/copilot/threads/1/turns/1/evidence/e1"
    }
  ],
  notes: []
};
function mount(Page = CopilotPage, locale = "en") {
  localStorage.setItem("locale", locale);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LocaleProvider>
            <ImportDataBridge />
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
  auth.user.role = "owner";
  restaurant.selectedBranchId = "101";
  api.mockImplementation(async (path, options) => {
    if (path.includes("/evidence/")) return { source: { data: { ledgerId: "IMPORTED-EVIDENCE" } } };
    if (path === "/copilot/threads")
      return { threads: [{ id: 1, title: "Saved question", scope: "restaurant", version: 1 }] };
    if (path === "/copilot/ask") return { threadId: 1, version: 1, answer };
    if (path === "/copilot/threads/1") return { version: 1, turns: [{ id: 1, question: "Saved question", answer }] };
    if (path.startsWith("/reports/executive")) return structuredClone(answer);
    throw new Error(`Unexpected request ${path} ${options?.method}`);
  });
});
for (const locale of ["ar", "en", "zh-CN"])
  it(`daily report renders evidence, executive explanation and scope in ${locale}`, async () => {
    const c = copilotUiCopy[locale === "zh-CN" ? "zh" : locale];
    mount(DailyReportPage, locale);
    expect(await screen.findByText("Documented change explanation")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: c.reportTitle }).closest("section")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr"
    );
    expect(screen.getByRole("link", { name: c.imports })).toHaveAttribute("href", "/app/imports");
    const details = screen.getByText(`${c.sources} e1`, { selector: "summary" }).closest("details");
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText(/IMPORTED-EVIDENCE/)).toBeInTheDocument();
  });
it("sends the question, reloads saved evidence and keeps conversation version", async () => {
  mount();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "profit yesterday" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Documented change explanation")).toBeInTheDocument();
  const body = JSON.parse(api.mock.calls.find(([p]) => p === "/copilot/ask")[1].body);
  expect(body).toMatchObject({ scope: "restaurant", language: "en", message: "profit yesterday" });
  expect(body.requestKey).toMatch(/^[a-f0-9-]{36}$/);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "And yesterday?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(api.mock.calls.filter(([p]) => p === "/copilot/ask")).toHaveLength(2));
  expect(JSON.parse(api.mock.calls.filter(([p]) => p === "/copilot/ask")[1][1].body)).toMatchObject({
    threadId: 1,
    version: 1
  });
});
it("branch managers are constrained and imports refresh reports", async () => {
  auth.user.role = "branch_manager";
  const { client } = mount(DailyReportPage);
  await screen.findByText("Documented change explanation");
  expect(screen.getByRole("combobox", { name: "Analysis scope" })).toBeDisabled();
  expect(api.mock.calls.some(([path]) => path.includes("scope=branch") && path.includes("branchId=101"))).toBe(true);
  const calls = api.mock.calls.length;
  announceDataChange({ organizationId: 1, restaurantId: 10, revision: 2 });
  await waitFor(() => expect(api.mock.calls.length).toBeGreaterThan(calls));
  expect(client.getQueryCache().findAll({ queryKey: ["daily-report"] })).toHaveLength(1);
});
it("scope changes clear the conversation; request failures remain recoverable", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Saved question" }));
  await screen.findByText("Documented change explanation");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "branch" } });
  expect(screen.queryByText("Documented change explanation")).not.toBeInTheDocument();
  api.mockRejectedValue(new Error("unavailable"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "profit" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(copilotUiCopy.en.error);
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});
it("missing evidence is explicit and saved answers show import staleness", async () => {
  api.mockResolvedValue({
    ...answer,
    stale: true,
    claims: [
      { key: "profit", label: "Profit", text: "Profit: Unavailable", status: "insufficient_data", sourceIds: [] }
    ]
  });
  mount(DailyReportPage);
  expect(await screen.findByText(copilotUiCopy.en.noData)).toBeInTheDocument();
  expect(screen.getByText(copilotUiCopy.en.stale)).toBeInTheDocument();
});
