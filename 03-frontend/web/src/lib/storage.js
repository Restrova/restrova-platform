const TOKEN_KEY = "token";
const RESTAURANT_KEY = "restaurant";
const ME_KEY = "me";

// In-memory mirror so the session survives environments where localStorage is
// partitioned, blocked, or unreliable (e.g. sandboxed preview iframes).
let memoryToken = null;

function readJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(token) {
  memoryToken = token || null;
  if (!token) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable: keep the in-memory copy only.
  }
}

export function getRestaurantName() {
  return localStorage.getItem(RESTAURANT_KEY);
}

export function setRestaurantName(name) {
  if (name) localStorage.setItem(RESTAURANT_KEY, name);
}

export function getStoredSession() {
  return readJson(ME_KEY);
}

export function setStoredSession(session) {
  if (!session) return;
  localStorage.setItem(ME_KEY, JSON.stringify(session));
  setRestaurantName(session.restaurant?.name);
}

export function clearAuthStorage() {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
    localStorage.removeItem(ME_KEY);
  } catch {
    // Storage unavailable: the in-memory reset above is enough.
  }
}

export function notifyAuthChange() {
  window.dispatchEvent(new Event("auth-change"));
}
