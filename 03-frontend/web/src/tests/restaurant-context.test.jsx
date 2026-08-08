import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../contexts/AuthContext.jsx";
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
    localStorage.setItem("token", "test-token");
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
});
