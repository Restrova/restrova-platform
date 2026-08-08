import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthBoundary } from "../components/auth/AuthBoundary.jsx";
import { AuthProvider } from "../contexts/AuthContext.jsx";

function renderProtectedRoute(initialPath = "/app/workspace") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<p>Login route</p>} />
          <Route element={<AuthBoundary />}>
            <Route path="/app/workspace" element={<p>Protected workspace</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("AuthBoundary", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("redirects unauthenticated users to login", async () => {
    renderProtectedRoute();
    expect(await screen.findByText("Login route")).toBeInTheDocument();
  });

  it("renders protected routes after restoring a valid session", async () => {
    localStorage.setItem("token", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        user: { id: 1, email: "owner@example.com", role: "owner" },
        restaurant: { id: 1, name: "Harbor" },
        organization: { id: 1, name: "Harbor Group", currency: "CNY", timezone: "Asia/Shanghai", language: "ar" },
        branches: []
      })
    })));

    renderProtectedRoute();
    await waitFor(() => expect(screen.getByText("Protected workspace")).toBeInTheDocument());
  });
});
