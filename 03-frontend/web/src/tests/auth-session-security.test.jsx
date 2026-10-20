import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../contexts/AuthContext.jsx";
import { api } from "../lib/api.js";
import { restoreSessionRequest } from "../lib/auth.js";
import { clearAuthStorage, getStoredSession, getToken, setStoredSession, setToken } from "../lib/storage.js";

const identity = { user: { id: 1, role: "owner" }, restaurant: { id: 10, name: "Private restaurant" } };

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser session security", () => {
  it("stores bearer credentials only for the browser session and excludes them from cached identity", () => {
    setToken("current-token");
    setStoredSession({ ...identity, token: "current-token" });

    expect(getToken()).toBe("current-token");
    expect(sessionStorage.getItem("token")).toBe("current-token");
    expect(getStoredSession()).toEqual(identity);
    for (const key of ["token", "me", "restaurant"]) expect(localStorage.getItem(key)).toBeNull();

    sessionStorage.clear();
    expect(getToken()).toBeNull();
    expect(getStoredSession()).toBeNull();
  });

  it("discards legacy persistent credentials instead of restoring them", () => {
    localStorage.setItem("token", "legacy-token");
    localStorage.setItem("me", JSON.stringify({ ...identity, token: "legacy-token" }));
    localStorage.setItem("restaurant", identity.restaurant.name);
    localStorage.setItem("locale", "ar");

    expect(getToken()).toBeNull();
    expect(getStoredSession()).toBeNull();
    for (const key of ["token", "me", "restaurant"]) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem("locale")).toBe("ar");
  });

  it("expires a rejected current bearer session", async () => {
    setToken("revoked-token");
    setStoredSession(identity);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "Invalid session" }, 401)));

    await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
    expect(getStoredSession()).toBeNull();
  });

  it("does not let an old request's rejection clear a newer login", async () => {
    setToken("old-token");
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const request = api("/auth/me");
    const rejected = expect(request).rejects.toMatchObject({ status: 401 });

    setToken("new-token");
    setStoredSession(identity);
    pending.resolve(response({ error: "Old session revoked" }, 401));
    await rejected;

    expect(getToken()).toBe("new-token");
    expect(getStoredSession()).toEqual(identity);
  });

  it("does not cache an in-flight identity response after the session is cleared", async () => {
    setToken("old-token");
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const request = restoreSessionRequest();

    clearAuthStorage();
    pending.resolve(response(identity));
    await request;

    expect(getToken()).toBeNull();
    expect(getStoredSession()).toBeNull();
  });

  it("revokes with the bearer token before clearing locally and ignores late restoration", async () => {
    setToken("current-token");
    const pendingRestore = deferred();
    const pendingLogout = deferred();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(identity))
      .mockReturnValueOnce(pendingRestore.promise)
      .mockReturnValueOnce(pendingLogout.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    let restoring;
    let loggingOut;
    act(() => {
      restoring = result.current.restore();
      loggingOut = result.current.logout();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer current-token" })
      })
    );
    expect(getToken()).toBe("current-token");

    await act(async () => {
      pendingLogout.resolve(response({ ok: true }));
      await loggingOut;
    });
    expect(result.current.status).toBe("unauthenticated");
    expect(getToken()).toBeNull();

    await act(async () => {
      pendingRestore.resolve(response(identity));
      await restoring;
    });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.session).toBeNull();
    expect(getStoredSession()).toBeNull();
  });

  it("still clears local credentials when server revocation is unavailable", async () => {
    setToken("current-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response(identity)).mockRejectedValueOnce(new TypeError("Network unavailable"))
    );
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => result.current.logout());

    expect(result.current.status).toBe("unauthenticated");
    expect(getToken()).toBeNull();
    expect(getStoredSession()).toBeNull();
  });
});
