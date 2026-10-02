import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReportSchedules } from "../pages/ReportSchedules.jsx";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api.js", () => ({ api }));
const copy = { cadence: "Report type", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
let data;
beforeEach(() => {
  data = {
    schedules: [
      {
        id: 1,
        cadence: "daily",
        language: "en",
        hour: 8,
        timezone: "Asia/Riyadh",
        enabled: true,
        nextRunAt: "2026-10-02T05:00:00Z"
      }
    ],
    runs: [{ id: 2, scheduleId: 1, status: "ready", scheduledFor: "2026-10-01T05:00:00Z" }]
  };
  api.mockReset();
  api.mockImplementation(async (path, options) =>
    path === "/reports/schedules" && !options?.method ? data : { content: "Saved", language: "en" }
  );
});
function mount(language = "en", onOpen = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReportSchedules
        scopeKey="1:10"
        branchId={101}
        language={language}
        copy={copy}
        onOpen={onOpen}
        onLive={vi.fn()}
      />
    </QueryClientProvider>
  );
}
it("creates localized branch schedule with selected cadence/hour and pauses independently", async () => {
  mount();
  await screen.findByRole("button", { name: "Pause" });
  fireEvent.change(screen.getByLabelText("Schedule frequency"), { target: { value: "weekly" } });
  fireEvent.change(screen.getByLabelText("Hour in restaurant timezone"), { target: { value: "9" } });
  fireEvent.click(screen.getByRole("button", { name: "Schedule report" }));
  await waitFor(() =>
    expect(
      api.mock.calls.some(
        ([p, o]) =>
          p === "/reports/schedules" &&
          o?.body === JSON.stringify({ cadence: "weekly", hour: 9, language: "en", branchId: 101 })
      )
    ).toBe(true)
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() =>
    expect(api.mock.calls.some(([p, o]) => p === "/reports/schedules/1" && o?.body === '{"enabled":false}')).toBe(true)
  );
});
it("opens stored snapshot and exposes errors safely", async () => {
  const open = vi.fn();
  mount("en", open);
  fireEvent.click(await screen.findByRole("button", { name: "View saved report" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith({ content: "Saved", language: "en" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled());
  api.mockRejectedValueOnce(new Error("private internal details"));
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update");
  expect(screen.queryByText("private internal details")).not.toBeInTheDocument();
});
for (const [locale, title] of [
  ["ar", "التقارير المجدولة"],
  ["zh", "定时报告"]
])
  it(`schedule controls support ${locale}`, async () => {
    mount(locale);
    expect(screen.getByText(title)).toBeInTheDocument();
    await waitFor(() => expect(api).toHaveBeenCalled());
  });
