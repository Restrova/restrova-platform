const TOKEN_KEY = "token";
const RESTAURANT_KEY = "restaurant";
const ME_KEY = "me";

function clearLegacyAuthStorage() {
  // Persistent bearer credentials from older versions must require a new login.
  for (const key of [TOKEN_KEY, RESTAURANT_KEY, ME_KEY]) localStorage.removeItem(key);
}

function readJson(key) {
  try {
    clearLegacyAuthStorage();
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  clearLegacyAuthStorage();
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  clearLegacyAuthStorage();
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

export function getRestaurantName() {
  clearLegacyAuthStorage();
  return sessionStorage.getItem(RESTAURANT_KEY);
}

export function setRestaurantName(name) {
  clearLegacyAuthStorage();
  if (name) sessionStorage.setItem(RESTAURANT_KEY, name);
}

export function getStoredSession() {
  return readJson(ME_KEY);
}

export function setStoredSession(session) {
  if (!session) return;
  clearLegacyAuthStorage();
  const identity = { ...session };
  delete identity.token;
  sessionStorage.setItem(ME_KEY, JSON.stringify(identity));
  setRestaurantName(session.restaurant?.name);
}

export function clearAuthStorage() {
  clearLegacyAuthStorage();
  for (const key of [TOKEN_KEY, RESTAURANT_KEY, ME_KEY]) sessionStorage.removeItem(key);
}

export function notifyAuthChange() {
  window.dispatchEvent(new Event("auth-change"));
}
