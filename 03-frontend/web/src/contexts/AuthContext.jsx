import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/api.js";
import { loginRequest, logoutRequest, registerRequest, restoreSessionRequest } from "../lib/auth.js";
import { clearAuthStorage, getStoredSession, getToken, notifyAuthChange } from "../lib/storage.js";

const AuthContext = createContext(null);

function getInitialState() {
  const token = getToken();
  const session = getStoredSession();
  return {
    status: token ? "checking" : "unauthenticated",
    session,
    error: null
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(getInitialState);

  const restore = useCallback(async () => {
    if (!getToken()) {
      setState({ status: "unauthenticated", session: null, error: null });
      return null;
    }

    setState((current) => ({ ...current, status: "checking", error: null }));

    try {
      const session = await restoreSessionRequest();
      setState({ status: "authenticated", session, error: null });
      return session;
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setState({ status: "forbidden", session: null, error });
        return null;
      }

      clearAuthStorage();
      setState({ status: "expired", session: null, error });
      return null;
    }
  }, []);

  useEffect(() => {
    restore();

    const syncFromStorage = () => {
      if (!getToken()) {
        setState({ status: "unauthenticated", session: null, error: null });
        return;
      }
      restore();
    };

    const markExpired = () => {
      setState({ status: "expired", session: null, error: null });
    };

    window.addEventListener("auth-change", syncFromStorage);
    window.addEventListener("auth-expired", markExpired);
    return () => {
      window.removeEventListener("auth-change", syncFromStorage);
      window.removeEventListener("auth-expired", markExpired);
    };
  }, [restore]);

  const login = useCallback(async (credentials) => {
    const session = await loginRequest(credentials);
    setState({ status: "authenticated", session, error: null });
    notifyAuthChange();
    return session;
  }, []);

  const register = useCallback(async (payload) => {
    const session = await registerRequest(payload);
    setState({ status: "authenticated", session, error: null });
    notifyAuthChange();
    return session;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    clearAuthStorage();
    setState({ status: "unauthenticated", session: null, error: null });
    notifyAuthChange();
  }, []);

  const value = useMemo(() => ({
    ...state,
    isAuthenticated: state.status === "authenticated",
    user: state.session?.user || null,
    organization: state.session?.organization || null,
    restaurant: state.session?.restaurant || null,
    branches: state.session?.branches || [],
    login,
    logout,
    register,
    restore
  }), [login, logout, register, restore, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
