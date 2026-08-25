import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { rmSync } from "node:fs";
import process from "node:process";
import { AppRoutes } from "../app/routes.jsx";
import { AuthProvider } from "../contexts/AuthContext.jsx";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RestaurantProvider } from "../contexts/RestaurantContext.jsx";

const nativeFetch = globalThis.fetch;
const databasePath = `/tmp/restrova-onboarding-e2e-${process.pid}-${Date.now()}.db`;
let server;
let apiOrigin;
let database;

describe("full-stack restaurant onboarding", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_PATH = databasePath;
    const backend = await import("../../../../02-backend/server/src/index.js");
    database = (await import("../../../../02-backend/server/src/db.js")).db;
    server = backend.app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    apiOrigin = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (database?.open) database.close();
    for (const suffix of ["", "-shm", "-wal"]) {
      rmSync(`${databasePath}${suffix}`, { force: true });
    }
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("locale", "en");
    vi.stubGlobal("fetch", (input, init) => {
      const url = typeof input === "string" && input.startsWith("/api") ? `${apiOrigin}${input}` : input;
      return nativeFetch(url, init);
    });
  });

  it("creates a real scoped account through the wizard and opens its persisted branch", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const email = `ui-onboarding-${stamp}@example.test`;

    render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthProvider>
            <RestaurantProvider>
              <MemoryRouter initialEntries={["/register?next=/app/branches"]}>
                <AppRoutes />
              </MemoryRouter>
            </RestaurantProvider>
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    );

    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "Full Stack Owner");
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password"), "full-stack-password-123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await user.clear(screen.getByLabelText("Organization"));
    await user.type(screen.getByLabelText("Organization"), `QA Organization ${stamp}`);
    await user.selectOptions(screen.getByLabelText("Currency"), "SAR");
    await user.selectOptions(screen.getByLabelText("Timezone"), "Asia/Riyadh");
    await user.selectOptions(screen.getByLabelText("Default language"), "en");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await user.clear(screen.getByLabelText("Restaurant"));
    await user.type(screen.getByLabelText("Restaurant"), `QA Restaurant ${stamp}`);
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await user.clear(screen.getByLabelText("First branch"));
    await user.type(screen.getByLabelText("First branch"), "Riyadh QA Main");
    await user.clear(screen.getByLabelText("Code"));
    await user.type(screen.getByLabelText("Code"), "RUH-QA");
    await user.clear(screen.getByLabelText("City"));
    await user.type(screen.getByLabelText("City"), "Riyadh");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    expect(await screen.findByRole("heading", { name: "Branch management" })).toBeInTheDocument();
    expect(await screen.findByText("Riyadh QA Main")).toBeInTheDocument();
    expect(await screen.findByText("RUH-QA")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeTruthy();

    const token = localStorage.getItem("token");
    const sessionResponse = await nativeFetch(`${apiOrigin}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const session = await sessionResponse.json();

    expect(sessionResponse.status).toBe(200);
    expect(session.user).toMatchObject({ email, role: "owner" });
    expect(session.organization).toMatchObject({
      name: `QA Organization ${stamp}`,
      currency: "SAR",
      timezone: "Asia/Riyadh",
      language: "en"
    });
    expect(session.restaurant.name).toBe(`QA Restaurant ${stamp}`);
    expect(session.branches).toEqual([
      expect.objectContaining({ name: "Riyadh QA Main", code: "RUH-QA", city: "Riyadh" })
    ]);

    await waitFor(() => expect(localStorage.getItem("selectedBranchId")).toBe(String(session.branches[0].id)));
  });
});
