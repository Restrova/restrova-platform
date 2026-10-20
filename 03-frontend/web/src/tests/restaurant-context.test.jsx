import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../contexts/AuthContext.jsx";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RestaurantProvider, useRestaurant } from "../contexts/RestaurantContext.jsx";
import { createTestSession, stubAuthenticatedFetch } from "./test-utils.jsx";

function wrapper({ children }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          <RestaurantProvider>{children}</RestaurantProvider>
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

describe("RestaurantContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.setItem("token", "test-token");
  });

  it("loads authenticated restaurant context and explicit demo mode", async () => {
    stubAuthenticatedFetch(createTestSession());
    const { result } = renderHook(() => useRestaurant(), { wrapper });
    await waitFor(() => expect(result.current.selectedRestaurant?.name).toBe("Harbor Demo"));
    expect(result.current.selectedBranch?.name).toBe("Main Branch");
    expect(result.current.demoMode).toBe(true);
  });

  it("clears invalid persisted ids and validates branch changes", async () => {
    localStorage.setItem("selectedRestaurantId", "bad");
    localStorage.setItem("selectedBranchId", "bad");
    stubAuthenticatedFetch(createTestSession());
    const { result } = renderHook(() => useRestaurant(), { wrapper });
    await waitFor(() => expect(result.current.selectedRestaurantId).toBe("10"));
    expect(result.current.selectedBranchId).toBe("101");
    expect(result.current.setSelectedBranchId("102")).toBe(true);
    expect(result.current.setSelectedBranchId("999")).toBe(false);
  });

  it.each(["logout", "role", "branch", "account"])("clears cached private data on %s changes", async (change) => {
    let session = createTestSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(session) }))
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RestaurantProvider>{children}</RestaurantProvider>
          </AuthProvider>
        </QueryClientProvider>
      )
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    queryClient.setQueryData(["private-detail", 123], { confidential: "previous authorization" });
    expect(queryClient.getQueryData(["private-detail", 123])).toBeDefined();

    await act(async () => {
      if (change === "logout") {
        await result.current.logout();
      } else {
        if (change === "role") session = { ...session, user: { ...session.user, role: "viewer" } };
        if (change === "branch") session = { ...session, branches: session.branches.slice(0, 1) };
        if (change === "account") {
          session = {
            ...session,
            user: { ...session.user, id: 2 },
            organization: { ...session.organization, id: 2 },
            restaurant: { ...session.restaurant, id: 20 }
          };
        }
        await result.current.restore();
      }
    });

    expect(queryClient.getQueryData(["private-detail", 123])).toBeUndefined();
  });

  it("lets newly authorized child queries finish after the initial session restore", async () => {
    stubAuthenticatedFetch(createTestSession());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let complete;
    const queryData = new Promise((resolve) => {
      complete = resolve;
    });
    const load = vi.fn(() => queryData);
    function PrivateDetail() {
      const auth = useAuth();
      const query = useQuery({ queryKey: ["private-detail", 123], queryFn: load, enabled: auth.isAuthenticated });
      return <p>{query.data || "Loading private detail"}</p>;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RestaurantProvider>
            <PrivateDetail />
          </RestaurantProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(load).toHaveBeenCalled());
    await act(async () => complete("Authorized private detail"));
    expect(await screen.findByText("Authorized private detail")).toBeInTheDocument();
  });

  it.each(["pending", "cached"])(
    "replaces %s private results with a completing query for the next account",
    async (state) => {
      let session = createTestSession();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(session) }))
      );
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let completeOld;
      let completeNew;
      const oldData = new Promise((resolve) => {
        completeOld = resolve;
      });
      const newData = new Promise((resolve) => {
        completeNew = resolve;
      });
      const load = vi.fn((userId) => (userId === 1 ? oldData : newData));
      function PrivateDetail() {
        const auth = useAuth();
        const query = useQuery({
          queryKey: ["private-detail", 123],
          queryFn: () => load(auth.user.id),
          enabled: auth.isAuthenticated
        });
        return <p>{query.data || "Loading private detail"}</p>;
      }
      function SessionControls() {
        const auth = useAuth();
        return <button onClick={() => auth.restore()}>Restore account</button>;
      }
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SessionControls />
            <RestaurantProvider>
              <PrivateDetail />
            </RestaurantProvider>
          </AuthProvider>
        </QueryClientProvider>
      );
      await waitFor(() => expect(load).toHaveBeenCalledWith(1));
      if (state === "cached") {
        await act(async () => completeOld("Previous account private detail"));
        expect(await screen.findByText("Previous account private detail")).toBeInTheDocument();
      }

      session = createTestSession({ user: { id: 2 }, restaurant: { id: 20 }, organization: { id: 2 } });
      fireEvent.click(screen.getByRole("button", { name: "Restore account" }));
      await waitFor(() => expect(load).toHaveBeenCalledWith(2));
      expect(screen.queryByText("Previous account private detail")).not.toBeInTheDocument();
      if (state === "pending") {
        await act(async () => completeOld("Previous account private detail"));
        expect(screen.queryByText("Previous account private detail")).not.toBeInTheDocument();
      }
      await act(async () => completeNew("Next account private detail"));
      expect(await screen.findByText("Next account private detail")).toBeInTheDocument();
      expect(queryClient.getQueryData(["private-detail", 123])).toBe("Next account private detail");
    }
  );
});
