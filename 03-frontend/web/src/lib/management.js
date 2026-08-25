import { api } from "./api.js";

export function listBranches() {
  return api("/branches");
}

export function createBranch(payload) {
  return api("/branches", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateBranch(branchId, payload) {
  return api(`/branches/${encodeURIComponent(branchId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function listUsers() {
  return api("/users");
}

export function inviteUser(payload) {
  return api("/users/invite", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateUserRole(userId, payload) {
  return api(`/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}
