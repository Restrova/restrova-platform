import { api } from "./api.js";
import { setStoredSession, setToken } from "./storage.js";

export async function loginRequest(credentials) {
  const session = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  setToken(session.token);
  setStoredSession(session);
  return session;
}

export async function registerRequest(payload) {
  const session = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setToken(session.token);
  setStoredSession(session);
  return session;
}

export async function switchRestaurantRequest(restaurantId) {
  const session = await api("/auth/switch-restaurant", {
    method: "POST",
    body: JSON.stringify({ restaurantId: Number(restaurantId) })
  });
  setToken(session.token);
  setStoredSession(session);
  return session;
}

export async function restoreSessionRequest() {
  const session = await api("/auth/me");
  setStoredSession(session);
  return session;
}

export async function logoutRequest() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    // Local logout must still work if the server session endpoint is unavailable.
  }
}
