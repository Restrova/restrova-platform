import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { AuthBoundary } from "../components/auth/AuthBoundary.jsx";
import { AppShell } from "../components/layout/AppShell.jsx";
import { AuthProvider } from "../contexts/AuthContext.jsx";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RestaurantProvider } from "../contexts/RestaurantContext.jsx";

export function renderWithLocale(ui) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

export function createTestSession(overrides = {}) {
  return {
    token: "test-token",
    user: { id: 1, email: "owner@harbor.test", name: "Demo Owner", role: "owner", ...overrides.user },
    organization: {
      id: 1,
      name: "Demo Group",
      currency: "CNY",
      timezone: "Asia/Shanghai",
      language: "ar",
      ...overrides.organization
    },
    restaurant: { id: 10, name: "Harbor Demo", ...overrides.restaurant },
    branches: [
      { id: 101, name: "Main Branch", code: "MAIN" },
      { id: 102, name: "Night Branch", code: "NIGHT" },
      ...(overrides.branches || [])
    ]
  };
}

export function stubAuthenticatedFetch(session = createTestSession()) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes("/api/auth/me")) {
      return { ok: true, text: async () => JSON.stringify(session) };
    }
    if (String(url).includes("/api/auth/logout")) {
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    }
    if (String(url).includes("/api/dashboard")) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            sales: { net_revenue: 0, profit: 0, orders: 0, margin_percent: 0 },
            inventory: { low_stock_count: 0 },
            topDishes: [],
            currency: "CNY"
          })
      };
    }
    if (String(url).includes("/api/branches")) {
      return { ok: true, text: async () => JSON.stringify(session.branches) };
    }
    return { ok: true, text: async () => JSON.stringify({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderWithShell({
  route = "/app/dashboard",
  session = createTestSession(),
  outlet = <p>Outlet content</p>,
  publicRoutes = true
} = {}) {
  localStorage.setItem("token", "test-token");
  const fetchMock = stubAuthenticatedFetch(session);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          <RestaurantProvider>
            <MemoryRouter initialEntries={[route]}>
              <Routes>
                {publicRoutes && <Route path="/login" element={<p>Login route</p>} />}
                <Route element={<AuthBoundary />}>
                  <Route element={<AppShell />}>
                    <Route path="/app/dashboard" element={outlet} />
                    <Route path="/app/workspace" element={outlet} />
                    <Route path="/app/menu-profitability" element={<p>Profitability placeholder</p>} />
                    <Route path="/app/alerts" element={<p>Alerts placeholder</p>} />
                    <Route path="/app/assistant" element={<p>Assistant placeholder</p>} />
                  </Route>
                </Route>
              </Routes>
            </MemoryRouter>
          </RestaurantProvider>
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
  return { ...result, fetchMock };
}
