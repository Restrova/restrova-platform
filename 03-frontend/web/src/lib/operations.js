import { api } from "./api.js";

export function getBranchOperations(filters, signal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return api(`/branches/operations?${query}`, { signal });
}
