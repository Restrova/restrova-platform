import { ApiError, api } from "./api.js";
import { getToken } from "./storage.js";

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function authenticatedFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    const body = parseResponseBody(await response.text());
    throw new ApiError((body && typeof body === "object" && body.error) || "Unable to complete request", {
      status: response.status,
      data: body
    });
  }

  return response;
}

function fileContentType(file) {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "text/csv";
}

export function listImportTemplates() {
  return api("/data/templates");
}

export function getImportJob(jobId) {
  return api(`/data/import-jobs/${encodeURIComponent(jobId)}`);
}

export async function previewImportFile({ templateKey, file }) {
  const query = new URLSearchParams({
    templateKey,
    filename: file.name
  });
  const response = await authenticatedFetch(`/data/import-jobs/preview?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": fileContentType(file) },
    body: file
  });
  return parseResponseBody(await response.text());
}

export function updateImportMapping(jobId, mappings) {
  return api(`/data/import-jobs/${encodeURIComponent(jobId)}/mapping`, {
    method: "PUT",
    body: JSON.stringify({ mappings })
  });
}

export function confirmImportJob(jobId, confirmationToken) {
  return api(`/data/import-jobs/${encodeURIComponent(jobId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmationToken })
  });
}

export function cancelImportJob(jobId) {
  return api(`/data/import-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

function filenameFromDisposition(disposition, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(disposition || "");
  return match?.[1] || fallback;
}

export async function downloadImportTemplate(templateKey) {
  const response = await authenticatedFetch(`/data/templates/${encodeURIComponent(templateKey)}/download`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filenameFromDisposition(
    response.headers.get("content-disposition"),
    `restrova-${templateKey}-template.csv`
  );
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
