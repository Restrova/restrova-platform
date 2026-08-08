const TOKEN_KEY = "token";
const RESTAURANT_KEY = "restaurant";
const ME_KEY = "me";

function readJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(RESTAURANT_KEY);
  localStorage.removeItem(ME_KEY);
}

export function notifyAuthChange() {
  window.dispatchEvent(new Event("auth-change"));
}
