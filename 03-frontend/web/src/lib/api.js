import { clearAuthStorage, getToken } from "./storage.js";

export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
  const body = parseResponseBody(await response.text());

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearAuthStorage();
      window.dispatchEvent(new CustomEvent("auth-expired"));
      window.dispatchEvent(new Event("auth-change"));
    }

    throw new ApiError(
      (body && typeof body === "object" && body.error) || "Unable to complete request",
      { status: response.status, data: body }
    );
  }

  return body;
}
