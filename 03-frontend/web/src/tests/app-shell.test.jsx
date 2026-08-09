import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../app/routes.jsx";
import { AuthProvider } from "../contexts/AuthContext.jsx";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RestaurantProvider } from "../contexts/RestaurantContext.jsx";
import { createTestSession, renderWithShell, stubAuthenticatedFetch } from "./test-utils.jsx";

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders authenticated shell, Outlet content, skip link and main content", async () => {
    renderWithShell({ outlet: <p>Dashboard content</p> });
    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "التنقل الرئيسي" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "متابعة" })).toHaveAttribute("href", "#main-content");
    expect(document.querySelector("#main-content")).toBeInTheDocument();
  });

  it("does not wrap public login route in the shell", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthProvider>
            <RestaurantProvider>
              <MemoryRouter initialEntries={["/login"]}>
                <AppRoutes />
              </MemoryRouter>
            </RestaurantProvider>
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    );
    expect(await screen.findByRole("button", { name: "Open decision center" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "التنقل الرئيسي" })).not.toBeInTheDocument();
  });

  it("shows active sidebar route, collapses, expands and persists preference", async () => {
    renderWithShell({ route: "/app/menu-profitability" });
    const activeLink = (await screen.findAllByRole("link", { name: /ربحية القائمة/ })).find(
      (link) => link.getAttribute("href") === "/app/menu-profitability"
    );
    expect(activeLink).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "طي الشريط الجانبي" }));
    expect(localStorage.getItem("sidebarCollapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "توسيع الشريط الجانبي" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "توسيع الشريط الجانبي" }));
    expect(localStorage.getItem("sidebarCollapsed")).toBe("false");
  });

  it("renders topbar controls and language switching updates shell labels", async () => {
    renderWithShell();
    expect(await screen.findByRole("heading", { name: "مركز القرار" })).toBeInTheDocument();
    expect(screen.getByLabelText("الفرع الحالي")).toBeInTheDocument();
    expect(screen.getByLabelText("تغيير اللغة")).toBeInTheDocument();
    expect(screen.getAllByText("وضع تجريبي").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "الإشعارات" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("تغيير اللغة"), "en");
    expect(await screen.findByRole("heading", { name: "Decision Center" })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("opens mobile drawer, traps focus, closes with Escape and restores focus", async () => {
    renderWithShell();
    const trigger = await screen.findByRole("button", { name: "فتح التنقل" });
    trigger.focus();
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Restrova Platform" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إغلاق التنقل" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Restrova Platform" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("mobile bottom navigation shows priority routes and More opens drawer", async () => {
    renderWithShell();
    const workspaceLinks = await screen.findAllByRole("link", { name: /مساحة العمل الحالية/ });
    expect(workspaceLinks.some((link) => link.getAttribute("href") === "/app/workspace")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "المزيد" }));
    expect(screen.getByRole("dialog", { name: "Restrova Platform" })).toBeInTheDocument();
  });

  it("logs out through centralized auth and redirects to login", async () => {
    const { fetchMock } = renderWithShell({ session: createTestSession() });
    await screen.findByText("Outlet content");
    await userEvent.click(screen.getAllByRole("button", { name: "تسجيل الخروج" })[0]);
    await waitFor(() => expect(screen.getByText("Login route")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.any(Object));
  });

  it("keeps the real legacy workspace rendered inside the shell", async () => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("restaurant", "Harbor Demo");
    localStorage.setItem("me", JSON.stringify(createTestSession()));
    stubAuthenticatedFetch(createTestSession());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthProvider>
            <RestaurantProvider>
              <MemoryRouter initialEntries={["/app/workspace"]}>
                <AppRoutes />
              </MemoryRouter>
            </RestaurantProvider>
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText("AI DECISION COPILOT")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask for a decision about sales, menu profit, or stock...")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "مساحة العمل الحالية" })).toBeInTheDocument();
  });
});
