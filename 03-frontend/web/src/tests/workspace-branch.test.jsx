import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LegacyApplication from "../components/legacy/LegacyApplication.jsx";
import { createTestSession, renderWithShell } from "./test-utils.jsx";

const response = (body) => ({ ok: true, text: async () => JSON.stringify(body) });
const coverage = { first: "2025-09-01T04:00:00Z", last: "2026-08-31T12:00:00Z" };

function renderWorkspace(onChat) {
  const session = createTestSession();
  const result = renderWithShell({ route: "/app/workspace", session, outlet: <LegacyApplication /> });
  result.fetchMock.mockImplementation(async (url, options = {}) => {
    const path = String(url);
    if (path.includes("/api/auth/me")) return response(session);
    if (path.includes("/api/dashboard")) {
      const branchId = new URL(path, "http://localhost").searchParams.get("branchId");
      return response({
        currency: "CNY",
        sales: {
          source: "imports",
          timezone: "Asia/Shanghai",
          has_sales: false,
          coverage: branchId === "102" ? coverage : { first: null, last: null },
          available_branches: [{ id: 102, name: "Night Branch", ...coverage }]
        },
        inventory: {},
        topDishes: []
      });
    }
    if (path === "/api/chat") return onChat(JSON.parse(options.body));
    if (path === "/api/feedback") return response({ saved: true });
    return response({});
  });
  return result;
}

function submitQuestion(message) {
  const input = screen.getByPlaceholderText(/Ask for a decision/);
  fireEvent.change(input, { target: { value: message } });
  fireEvent.submit(input.closest("form"));
}

describe("workspace branch selection", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens imported branches and analyzes their available dates with scoped feedback", async () => {
    const onChat = vi.fn(async () => response({ sessionId: 22, message: { id: 23, content: "Night branch sales" } }));
    const { fetchMock } = renderWorkspace(onChat);
    fireEvent.click(await screen.findByRole("button", { name: "Night Branch" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "الفرع الحالي" })).toHaveValue("102"));
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/dashboard?branchId=102")).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: "حلّل الفترة المتوفرة" }));
    expect(await screen.findByText("Night branch sales")).toBeInTheDocument();
    expect(onChat).toHaveBeenCalledWith({ message: "حلل المبيعات من 2025-09-01 إلى 2026-08-31", branchId: 102 });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) => url === "/api/feedback" && JSON.parse(options.body).branchId === 102
        )
      ).toBe(true)
    );
    const topDish = within(screen.getByText("TOP DISH").closest("article"));
    expect(topDish.getByText("No sales records for this period")).toBeInTheDocument();
  });

  it("discards late replies when changing branches and starts a fresh conversation", async () => {
    let resolveOldReply;
    const onChat = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldReply = resolve;
          })
      )
      .mockResolvedValueOnce(response({ sessionId: 44, message: { id: 45, content: "Selected branch answer" } }))
      .mockResolvedValueOnce(response({ sessionId: 66, message: { id: 67, content: "Main branch answer" } }));
    renderWorkspace(onChat);
    await screen.findByRole("button", { name: "Night Branch" });
    submitQuestion("Old question");
    await waitFor(() => expect(onChat).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("combobox", { name: "الفرع الحالي" }), { target: { value: "102" } });
    await screen.findByRole("button", { name: "حلّل الفترة المتوفرة" });
    await act(async () =>
      resolveOldReply(response({ sessionId: 11, message: { id: 12, content: "Stale branch answer" } }))
    );
    expect(screen.queryByText("Stale branch answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Old question")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    submitQuestion("New question");
    expect(await screen.findByText("Selected branch answer")).toBeInTheDocument();
    expect(onChat.mock.calls[1][0]).toEqual({ message: "New question", branchId: 102 });
    fireEvent.change(screen.getByRole("combobox", { name: "الفرع الحالي" }), { target: { value: "101" } });
    await screen.findByRole("button", { name: "Night Branch" });
    expect(screen.queryByText("Selected branch answer")).not.toBeInTheDocument();
    submitQuestion("Back to main");
    expect(await screen.findByText("Main branch answer")).toBeInTheDocument();
    expect(onChat.mock.calls[2][0]).toEqual({ message: "Back to main", branchId: 101 });
  });
});
