import crypto from "node:crypto";
import { config } from "../config/appConfig.js";
import { conflict, forbidden, notFound, validationError } from "../errors/appError.js";
import {
  applyColumnMappings,
  findMissingRequiredMappings,
  mappingSummary,
  sourceColumnForTarget,
  suggestColumnMappings,
  validateManualMappings
} from "../import/columnMapping.js";
import { parseUploadedTable } from "../import/stagedFileParser.js";
import { logInfo } from "../observability/logger.js";
import * as stagedImportRepository from "../repositories/stagedImportRepository.js";
import { detectImportTemplate, getImportTemplate } from "./importTemplateService.js";

const MAX_FILENAME_LENGTH = 255;

function rowIssue(field, code, message, severity = "error") {
  return { field, code, message, severity };
}

function cleanFilename(filename) {
  const clean = String(filename || "")
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.trim();
  if (!clean) throw validationError("filename is required.");
  if (clean.length > MAX_FILENAME_LENGTH) throw validationError("filename is too long.");
  return clean;
}

function requiredText(row, field, errors, max = 240) {
  const value = String(row[field] ?? "").trim();
  if (!value) {
    errors.push(rowIssue(field, "required", `${field} is required.`));
    return "";
  }
  if (value.length > max) errors.push(rowIssue(field, "too_long", `${field} is too long.`));
  if (/^[=+\-@]/.test(value)) {
    errors.push(rowIssue(field, "unsafe_formula", `${field} cannot begin with a spreadsheet formula indicator.`));
  }
  return value;
}

function optionalText(row, field, max = 240, errors = []) {
  const value = String(row[field] ?? "").trim();
  if (value.length > max) errors.push(rowIssue(field, "too_long", `${field} is too long.`));
  if (/^[=+\-@]/.test(value)) {
    errors.push(rowIssue(field, "unsafe_formula", `${field} cannot begin with a spreadsheet formula indicator.`));
  }
  return value;
}

function parseMoneyMinor(value, field, errors, { required = true, defaultMinor = 0 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) errors.push(rowIssue(field, "required", `${field} is required.`));
    return defaultMinor;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    errors.push(rowIssue(field, "invalid_money", `${field} must be a non-negative amount with at most 2 decimals.`));
    return defaultMinor;
  }
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    errors.push(rowIssue(field, "money_too_large", `${field} is too large.`));
    return defaultMinor;
  }
  return Number(minor);
}

function parsePositiveNumber(value, field, errors) {
  const text = String(value ?? "").trim();
  if (!text) {
    errors.push(rowIssue(field, "required", `${field} is required.`));
    return 0;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(rowIssue(field, "invalid_number", `${field} must be greater than zero.`));
    return 0;
  }
  return parsed;
}

function parseBoolean(value, field, errors, defaultValue = 1) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return defaultValue;
  if (["true", "1", "yes"].includes(text)) return 1;
  if (["false", "0", "no"].includes(text)) return 0;
  errors.push(rowIssue(field, "invalid_boolean", `${field} must be true or false.`));
  return defaultValue;
}

function parseTime(value, field, errors, defaultValue) {
  const text = String(value ?? "").trim();
  if (!text) return defaultValue;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    errors.push(rowIssue(field, "invalid_time", `${field} must use HH:MM.`));
    return defaultValue;
  }
  return text;
}

function parseDateTime(value, field, errors) {
  const text = String(value ?? "").trim();
  if (!text) {
    errors.push(rowIssue(field, "required", `${field} is required.`));
    return "";
  }
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(text);
  const parsed = new Date(text);
  if (!hasExplicitTimezone || Number.isNaN(parsed.getTime())) {
    errors.push(
      rowIssue(field, "invalid_datetime", `${field} must be an ISO-compatible date/time with an explicit timezone.`)
    );
    return "";
  }
  return parsed.toISOString();
}

function validateBranchRow(row, seen) {
  const errors = [];
  const branchCode = requiredText(row, "branch_code", errors, 40);
  const key = branchCode.toLowerCase();
  if (branchCode && seen.has(key)) {
    errors.push(rowIssue("branch_code", "duplicate_in_file", "branch_code is duplicated in this file."));
  }
  if (branchCode) seen.add(key);
  return {
    errors,
    normalized: {
      branch_code: branchCode,
      name: requiredText(row, "name", errors, 160),
      city: requiredText(row, "city", errors, 120),
      address: optionalText(row, "address", 240, errors),
      phone: optionalText(row, "phone", 80, errors),
      pos_system: optionalText(row, "pos_system", 120, errors),
      operating_day_start: parseTime(row.operating_day_start, "operating_day_start", errors, "10:00"),
      operating_day_end: parseTime(row.operating_day_end, "operating_day_end", errors, "02:00")
    }
  };
}

function validateMenuRow(row, seen) {
  const errors = [];
  const itemCode = requiredText(row, "item_code", errors, 80);
  const key = itemCode.toLowerCase();
  if (itemCode && seen.has(key)) {
    errors.push(rowIssue("item_code", "duplicate_in_file", "item_code is duplicated in this file."));
  }
  if (itemCode) seen.add(key);
  return {
    errors,
    normalized: {
      item_code: itemCode,
      name: requiredText(row, "name", errors, 160),
      category: optionalText(row, "category", 120, errors),
      selling_price_minor: parseMoneyMinor(row.selling_price, "selling_price", errors),
      active: parseBoolean(row.active, "active", errors, 1)
    }
  };
}

function validateCostRow(user, row, seen) {
  const errors = [];
  const itemCode = requiredText(row, "item_code", errors, 80);
  const branchCode = optionalText(row, "branch_code", 40, errors);
  const item = itemCode ? stagedImportRepository.findCatalogItemByCode(user, itemCode) : null;
  if (itemCode && !item) {
    errors.push(rowIssue("item_code", "unknown_item", "item_code does not match an imported menu item."));
  }
  const branch = branchCode ? stagedImportRepository.findBranchByCode(user, branchCode) : null;
  if (branchCode && !branch) {
    errors.push(rowIssue("branch_code", "missing_branch", "branch_code does not match a restaurant branch."));
  }
  const effectiveFrom = parseDateTime(row.effective_from, "effective_from", errors);
  const scopeKey = branch ? `branch:${branch.id}` : "restaurant";
  const duplicateKey = `${item?.id || itemCode.toLowerCase()}|${scopeKey}|${effectiveFrom}`;
  let duplicate = false;
  if (item && effectiveFrom) {
    duplicate =
      seen.has(duplicateKey) || stagedImportRepository.costRecordExists(user, item.id, scopeKey, effectiveFrom);
    seen.add(duplicateKey);
  }
  return {
    errors,
    duplicate,
    duplicateMessage: duplicate
      ? rowIssue("effective_from", "duplicate", "This cost record already exists.", "warning")
      : null,
    normalized: {
      item_code: itemCode,
      catalog_item_id: item?.id || null,
      branch_code: branchCode,
      branch_id: branch?.id || null,
      scope_key: scopeKey,
      direct_food_cost_minor: parseMoneyMinor(row.direct_food_cost, "direct_food_cost", errors),
      packaging_cost_minor: parseMoneyMinor(row.packaging_cost, "packaging_cost", errors, {
        required: false,
        defaultMinor: 0
      }),
      effective_from: effectiveFrom
    }
  };
}

function validateSalesRow(user, row, seen) {
  const errors = [];
  const orderId = requiredText(row, "external_order_id", errors, 120);
  const lineId = requiredText(row, "external_line_id", errors, 120);
  const branchCode = requiredText(row, "branch_code", errors, 40);
  const itemCode = requiredText(row, "item_code", errors, 80);
  const branch = branchCode ? stagedImportRepository.findBranchByCode(user, branchCode) : null;
  const item = itemCode ? stagedImportRepository.findCatalogItemByCode(user, itemCode) : null;
  if (branchCode && !branch) {
    errors.push(rowIssue("branch_code", "missing_branch", "branch_code does not match a restaurant branch."));
  }
  if (itemCode && !item) {
    errors.push(rowIssue("item_code", "unknown_item", "item_code does not match an imported menu item."));
  }
  const channel = String(row.channel ?? "")
    .trim()
    .toLowerCase();
  if (!["dine_in", "takeaway", "delivery"].includes(channel)) {
    errors.push(rowIssue("channel", "invalid_channel", "channel must be dine_in, takeaway, or delivery."));
  }
  const createdAt = parseDateTime(row.created_at, "created_at", errors);
  const duplicateKey = `${branch?.id || branchCode.toLowerCase()}|${orderId}|${lineId}`;
  let duplicate = false;
  if (branch && orderId && lineId) {
    duplicate = seen.has(duplicateKey) || stagedImportRepository.salesLineExists(user, branch.id, orderId, lineId);
    seen.add(duplicateKey);
  }
  return {
    errors,
    duplicate,
    duplicateMessage: duplicate
      ? rowIssue("external_line_id", "duplicate", "This sales line was already imported.", "warning")
      : null,
    normalized: {
      external_order_id: orderId,
      external_line_id: lineId,
      branch_code: branchCode,
      branch_id: branch?.id || null,
      created_at: createdAt,
      channel,
      item_code: itemCode,
      catalog_item_id: item?.id || null,
      quantity: parsePositiveNumber(row.quantity, "quantity", errors),
      gross_sales_minor: parseMoneyMinor(row.gross_sales, "gross_sales", errors),
      discount_minor: parseMoneyMinor(row.discount, "discount", errors, { required: false, defaultMinor: 0 }),
      refund_amount_minor: parseMoneyMinor(row.refund_amount, "refund_amount", errors, {
        required: false,
        defaultMinor: 0
      }),
      delivery_commission_minor: parseMoneyMinor(row.delivery_commission, "delivery_commission", errors, {
        required: false,
        defaultMinor: 0
      })
    }
  };
}

function enrichIssue(issue, mappedRow, originalRow, mappings) {
  const sourceColumn = issue.field ? sourceColumnForTarget(mappings, issue.field) : null;
  return {
    ...issue,
    sourceColumn,
    value: sourceColumn ? (originalRow[sourceColumn] ?? null) : (mappedRow[issue.field] ?? null)
  };
}

function validateRows(user, templateKey, mappedRows, originalRows, mappings) {
  const seen = new Set();
  return mappedRows.map((raw, index) => {
    let result;
    if (templateKey === "branches") result = validateBranchRow(raw, seen);
    else if (templateKey === "menu") result = validateMenuRow(raw, seen);
    else if (templateKey === "costs") result = validateCostRow(user, raw, seen);
    else result = validateSalesRow(user, raw, seen);

    const originalRow = originalRows[index] || {};
    const issues = result.errors.map((issue) => enrichIssue(issue, raw, originalRow, mappings));
    let status = "accepted";
    if (issues.length) status = "rejected";
    else if (result.duplicate) {
      status = "duplicate";
      if (result.duplicateMessage) {
        issues.push(enrichIssue(result.duplicateMessage, raw, originalRow, mappings));
      }
    }

    return {
      rowNumber: index + 2,
      raw: originalRow,
      normalized: result.normalized,
      errors: issues,
      status
    };
  });
}

function pendingMappingRows(rows) {
  return rows.map((raw, index) => ({
    rowNumber: index + 2,
    raw,
    normalized: null,
    errors: [],
    status: "accepted"
  }));
}

function countRows(rows) {
  return rows.reduce(
    (result, row) => {
      result.total += 1;
      if (row.status === "accepted") result.accepted += 1;
      if (row.status === "rejected") result.rejected += 1;
      if (row.status === "duplicate") result.duplicates += 1;
      result.rowWarnings += row.errors.filter((issue) => issue.severity === "warning").length;
      return result;
    },
    { total: 0, accepted: 0, rejected: 0, duplicates: 0, rowWarnings: 0 }
  );
}

function buildValidation(user, template, sourceRows, mappings) {
  const summary = mappingSummary(template, mappings);
  if (!summary.ready) {
    return {
      mappings,
      summary,
      rows: pendingMappingRows(sourceRows),
      counts: { total: sourceRows.length, accepted: 0, rejected: 0, duplicates: 0, rowWarnings: 0 },
      validationStatus: "needs_mapping",
      warningCount: summary.unmappedCount
    };
  }

  const mappedRows = applyColumnMappings(sourceRows, mappings);
  const rows = validateRows(user, template.key, mappedRows, sourceRows, mappings);
  const counts = countRows(rows);

  return {
    mappings,
    summary,
    rows,
    counts,
    validationStatus: counts.rejected > 0 ? "validation_failed" : "ready",
    warningCount: summary.unmappedCount + counts.rowWarnings
  };
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function newConfirmationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function confirmationTokenExpiresAt() {
  return new Date(Date.now() + config.imports.confirmationTokenTtlSeconds * 1000).toISOString();
}

function requestIdOrFallback(requestId) {
  return String(requestId || crypto.randomUUID());
}

function recordAudit(user, job, eventType, requestId, details = {}) {
  const safeRequestId = requestIdOrFallback(requestId);
  stagedImportRepository.recordImportAuditEvent({
    importJobId: job.id,
    organizationId: user.organization_id,
    restaurantId: user.restaurant_id,
    branchId: user.branch_id,
    userId: user.owner_id,
    templateKey: job.template_key,
    eventType,
    requestId: safeRequestId,
    details
  });
  logInfo("import_event", {
    requestId: safeRequestId,
    importJobId: job.id,
    organizationId: user.organization_id,
    branchId: user.branch_id || null,
    templateKey: job.template_key,
    status: eventType
  });
}

function parseStoredRow(row) {
  return {
    rowNumber: row.row_number,
    status: row.status,
    raw: JSON.parse(row.raw_json),
    normalized: row.normalized_json ? JSON.parse(row.normalized_json) : null,
    errors: JSON.parse(row.errors_json)
  };
}

function publicJob(job, rows, auditRows = []) {
  const parsedRows = rows.map(parseStoredRow);
  const mappings = JSON.parse(job.mapping_json || "[]");
  const sourceHeaders = JSON.parse(job.source_headers_json || "[]");
  const template = getImportTemplate(job.template_key);
  const summary = mappingSummary(template, mappings);
  const validationStatus = job.validation_status || "ready";
  let workflowStatus = job.status === "preview_ready" ? validationStatus : job.status;
  if (job.status === "preview_ready" && auditRows.at(-1)?.event_type === "import_failed") {
    workflowStatus = "failed";
  }

  const previewRows = parsedRows.slice(0, config.imports.previewRows).map((row) => ({
    ...row,
    status: validationStatus === "needs_mapping" ? "pending_mapping" : row.status
  }));

  const rowErrors = parsedRows
    .map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      errors: row.errors.filter((issue) => issue.severity !== "warning")
    }))
    .filter((row) => row.errors.length)
    .slice(0, 200);

  const rowWarnings = parsedRows
    .map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      warnings: row.errors.filter((issue) => issue.severity === "warning")
    }))
    .filter((row) => row.warnings.length)
    .slice(0, 200);

  return {
    id: job.id,
    templateKey: job.template_key,
    templateVersion: job.template_version,
    status: job.status,
    validationStatus,
    workflowStatus,
    file: {
      name: job.original_filename,
      type: job.file_type,
      contentType: job.content_type,
      byteSize: job.byte_size,
      sha256: job.file_sha256,
      uploadedAt: job.created_at
    },
    mapping: {
      sourceHeaders,
      columns: mappings,
      targetFields: template.columns.map(({ name, required, type }) => ({ name, required, type })),
      ...summary,
      warnings: summary.unmappedColumns.map((sourceColumn) => ({
        sourceColumn,
        code: "unmapped_optional_column",
        message: `${sourceColumn} is not mapped and will be ignored unless you map it manually.`
      }))
    },
    statistics: {
      total: job.total_rows,
      accepted: job.accepted_rows,
      rejected: job.rejected_rows,
      duplicates: job.duplicate_rows,
      skipped: job.duplicate_rows,
      warnings: job.warning_count || 0,
      imported: job.imported_rows
    },
    previewRows,
    rowErrors,
    rowWarnings,
    auditEvents: auditRows.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      requestId: event.request_id,
      branchId: event.branch_id,
      details: JSON.parse(event.details_json || "{}"),
      createdAt: event.created_at
    })),
    createdAt: job.created_at,
    confirmationExpiresAt:
      job.status === "preview_ready" && !job.confirmation_consumed_at ? job.confirmation_token_expires_at : null,
    mappingUpdatedAt: job.mapping_updated_at,
    confirmedAt: job.confirmed_at,
    cancelledAt: job.cancelled_at
  };
}

function getJobOrThrow(user, jobId) {
  const id = Number(jobId);
  if (!Number.isInteger(id) || id <= 0) throw notFound("Import job not found");
  const job = stagedImportRepository.findImportJobInScope(user, id);
  if (!job) throw notFound("Import job not found");
  return { id, job };
}

export function previewStagedImport(user, { templateKey, filename, contentType, buffer, requestId }) {
  const safeRequestId = requestIdOrFallback(requestId);
  const originalFilename = cleanFilename(filename);
  const parsed = parseUploadedTable({ buffer, filename: originalFilename, contentType });
  const automatic = !templateKey || templateKey === "auto";
  const detected = automatic ? detectImportTemplate(parsed.headers) : null;
  const template = detected?.template || getImportTemplate(templateKey);
  const mappings = detected?.mappings || suggestColumnMappings(parsed.headers, template);
  const detection = detected?.detection || {
    mode: "manual",
    templateKey: template.key,
    displayName: template.displayName,
    confidence: "confirmed",
    requiredCoverageBps: null,
    matchedFields: mappings.filter((mapping) => mapping.targetField).map((mapping) => mapping.targetField),
    candidates: []
  };
  const validation = buildValidation(user, template, parsed.rows, mappings);
  const confirmationToken = newConfirmationToken();

  const jobId = stagedImportRepository.createImportJob({
    organizationId: user.organization_id,
    restaurantId: user.restaurant_id,
    createdBy: user.owner_id,
    templateKey: template.key,
    templateVersion: template.version,
    originalFilename,
    contentType: String(contentType || "application/octet-stream").split(";")[0],
    fileType: parsed.fileType,
    byteSize: buffer.length,
    fileSha256: hash(buffer),
    confirmationTokenHash: hash(confirmationToken),
    totalRows: validation.counts.total,
    acceptedRows: validation.counts.accepted,
    rejectedRows: validation.counts.rejected,
    duplicateRows: validation.counts.duplicates,
    sourceHeaders: parsed.headers,
    mappings,
    validationStatus: validation.validationStatus,
    warningCount: validation.warningCount,
    confirmationTokenExpiresAt: confirmationTokenExpiresAt(),
    requestId: safeRequestId
  });

  stagedImportRepository.insertImportJobRows(jobId, validation.rows);
  const job = stagedImportRepository.findImportJobInScope(user, jobId);
  recordAudit(user, job, "import_job_created", safeRequestId);
  recordAudit(user, job, "file_uploaded", safeRequestId, {
    filename: originalFilename,
    fileType: parsed.fileType,
    byteSize: buffer.length,
    sha256: job.file_sha256
  });
  recordAudit(user, job, "file_type_classified", safeRequestId, detection);
  recordAudit(user, job, "validation_started", safeRequestId);
  recordAudit(user, job, "validation_completed", safeRequestId, {
    totalRows: validation.counts.total,
    validRows: validation.counts.accepted,
    invalidRows: validation.counts.rejected,
    duplicateRows: validation.counts.duplicates,
    warningCount: validation.warningCount
  });
  if (validation.validationStatus === "validation_failed") {
    recordAudit(user, job, "validation_failed", safeRequestId, {
      errorCategory: "row_validation",
      invalidRows: validation.counts.rejected
    });
  } else if (validation.validationStatus === "needs_mapping") {
    recordAudit(user, job, "mapping_required", safeRequestId, {
      missingRequiredMappings: validation.summary.missingRequiredMappings
    });
  } else {
    recordAudit(user, job, "import_ready", safeRequestId);
  }
  const result = publicJob(
    job,
    stagedImportRepository.listImportJobRows(jobId),
    stagedImportRepository.listImportAuditEvents(jobId)
  );

  return {
    ...result,
    detection,
    confirmationToken: validation.validationStatus === "ready" ? confirmationToken : null
  };
}

export function updateStagedImportMapping(user, jobId, mappings, requestId) {
  const safeRequestId = requestIdOrFallback(requestId);
  const { id, job } = getJobOrThrow(user, jobId);
  if (job.status !== "preview_ready") throw conflict(`Import job is already ${job.status}.`);

  const template = getImportTemplate(job.template_key);
  const headers = JSON.parse(job.source_headers_json || "[]");
  const mappingErrors = validateManualMappings(template, headers, mappings);
  if (mappingErrors.length) {
    throw validationError(mappingErrors.map((error) => error.message).join(" "));
  }

  const storedRows = stagedImportRepository.listImportJobRows(id).map(parseStoredRow);
  const sourceRows = storedRows.map((row) => row.raw);
  const validation = buildValidation(user, template, sourceRows, mappings);
  const confirmationToken = newConfirmationToken();

  const changed = stagedImportRepository.replaceImportJobValidation(
    id,
    {
      mappings,
      validationStatus: validation.validationStatus,
      warningCount: validation.warningCount,
      totalRows: validation.counts.total,
      acceptedRows: validation.counts.accepted,
      rejectedRows: validation.counts.rejected,
      duplicateRows: validation.counts.duplicates,
      confirmationTokenHash: hash(confirmationToken),
      confirmationTokenExpiresAt: confirmationTokenExpiresAt(),
      requestId: safeRequestId
    },
    validation.rows
  );

  if (!changed) throw conflict("Import job is no longer available to update.");

  const updated = stagedImportRepository.findImportJobInScope(user, id);
  recordAudit(user, updated, "mapping_changed", safeRequestId, {
    mappedColumns: validation.summary.mappedCount,
    missingRequiredMappings: validation.summary.missingRequiredMappings
  });
  recordAudit(user, updated, "validation_completed", safeRequestId, {
    totalRows: validation.counts.total,
    validRows: validation.counts.accepted,
    invalidRows: validation.counts.rejected,
    duplicateRows: validation.counts.duplicates,
    warningCount: validation.warningCount
  });
  recordAudit(
    user,
    updated,
    validation.validationStatus === "ready" ? "import_ready" : validation.validationStatus,
    safeRequestId
  );
  const result = publicJob(
    updated,
    stagedImportRepository.listImportJobRows(id),
    stagedImportRepository.listImportAuditEvents(id)
  );
  return {
    ...result,
    confirmationToken: validation.validationStatus === "ready" ? confirmationToken : null
  };
}

export function getStagedImportJob(user, jobId) {
  const { id, job } = getJobOrThrow(user, jobId);
  return publicJob(job, stagedImportRepository.listImportJobRows(id), stagedImportRepository.listImportAuditEvents(id));
}

export function listStagedImportJobs(user, filters = {}) {
  const allowedStatuses = new Set([
    "preview_ready",
    "needs_mapping",
    "validation_failed",
    "ready",
    "failed",
    "confirmed",
    "completed",
    "cancelled"
  ]);
  const normalized = {};
  if (filters.status) {
    normalized.status = String(filters.status);
    if (!allowedStatuses.has(normalized.status)) throw validationError("Invalid import status filter.");
  }
  if (filters.template) {
    normalized.templateKey = getImportTemplate(String(filters.template)).key;
  }
  if (filters.branch) {
    normalized.branchId = Number(filters.branch);
    if (!Number.isInteger(normalized.branchId) || normalized.branchId <= 0) {
      throw validationError("Invalid branch filter.");
    }
    if (!stagedImportRepository.findBranchById(user, normalized.branchId)) {
      throw notFound("Branch not found");
    }
  }
  for (const key of ["from", "to"]) {
    if (!filters[key]) continue;
    const parsed = new Date(String(filters[key]));
    if (Number.isNaN(parsed.getTime())) throw validationError(`Invalid ${key} date filter.`);
    normalized[key] = parsed.toISOString();
  }
  if (normalized.from && normalized.to && normalized.from > normalized.to) {
    throw validationError("The from date must be before the to date.");
  }

  const jobs = stagedImportRepository
    .listImportJobsInScope(user, normalized)
    .map((job) =>
      publicJob(job, [], normalized.status === "failed" ? stagedImportRepository.listImportAuditEvents(job.id) : [])
    );
  return { count: jobs.length, jobs };
}

export function getStagedImportMetrics(user) {
  const row = stagedImportRepository.getImportMetricsInScope(user);
  return {
    importsStarted: Number(row.imports_started || 0),
    importsCompleted: Number(row.imports_completed || 0),
    importsFailed: Number(row.imports_failed || 0),
    validationFailures: Number(row.validation_failures || 0),
    duplicateRows: Number(row.duplicate_rows || 0),
    rowsImported: Number(row.rows_imported || 0),
    averageImportDurationMs:
      row.average_import_duration_ms == null ? null : Number(Number(row.average_import_duration_ms).toFixed(2))
  };
}

function assertConfirmationToken(job, confirmationToken) {
  if (
    job.confirmation_consumed_at ||
    !job.confirmation_token_expires_at ||
    Date.parse(job.confirmation_token_expires_at) <= Date.now()
  ) {
    throw forbidden("Confirmation token has expired or was already used");
  }
  if (!confirmationToken || typeof confirmationToken !== "string") {
    throw forbidden("Invalid confirmation token");
  }
  const supplied = Buffer.from(hash(confirmationToken), "hex");
  const expected = Buffer.from(job.confirmation_token_hash, "hex");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw forbidden("Invalid confirmation token");
  }
}

export function confirmStagedImport(user, jobId, confirmationToken, requestId) {
  const safeRequestId = requestIdOrFallback(requestId);
  const { id, job } = getJobOrThrow(user, jobId);
  if (job.status !== "preview_ready") throw conflict(`Import job is already ${job.status}.`);
  if ((job.validation_status || "ready") !== "ready" || job.rejected_rows > 0) {
    throw conflict("Import job has blocking validation errors and cannot be confirmed.");
  }

  try {
    assertConfirmationToken(job, confirmationToken);
  } catch (error) {
    recordAudit(user, job, "import_failed", safeRequestId, {
      failureStage: "confirmation",
      errorCategory: error.code || "invalid_confirmation"
    });
    throw error;
  }
  const rows = stagedImportRepository.listImportJobRows(id).map(parseStoredRow);
  const accepted = rows.filter((row) => row.status === "accepted");
  let importedRows = 0;

  stagedImportRepository.transaction(() => {
    const current = stagedImportRepository.findImportJobInScope(user, id);
    if (!current || current.status !== "preview_ready" || current.validation_status !== "ready") {
      throw conflict("Import job is no longer available to confirm.");
    }

    for (const row of accepted) {
      const data = row.normalized;
      if (job.template_key === "branches") {
        stagedImportRepository.upsertBranch(user, data);
        importedRows += 1;
      } else if (job.template_key === "menu") {
        stagedImportRepository.upsertCatalogItem(user, data);
        importedRows += 1;
      } else if (job.template_key === "costs") {
        importedRows += stagedImportRepository.insertCost(user, data);
      } else if (job.template_key === "sales") {
        importedRows += stagedImportRepository.insertSalesLine(user, data);
      }
    }

    if (!stagedImportRepository.markImportJobConfirmed(id, importedRows, safeRequestId)) {
      throw conflict("Import job is no longer available to confirm.");
    }
    const confirmed = stagedImportRepository.findImportJobInScope(user, id);
    recordAudit(user, confirmed, "import_confirmed", safeRequestId, { importedRows });
    recordAudit(user, confirmed, "import_completed", safeRequestId, {
      importedRows,
      skippedRows: confirmed.duplicate_rows
    });
  });

  return getStagedImportJob(user, id);
}

export function cancelStagedImport(user, jobId, requestId) {
  const safeRequestId = requestIdOrFallback(requestId);
  const { id, job } = getJobOrThrow(user, jobId);
  if (job.status !== "preview_ready") throw conflict(`Import job is already ${job.status}.`);
  if (!stagedImportRepository.cancelImportJob(id, safeRequestId)) {
    throw conflict("Import job is no longer available to cancel.");
  }
  const cancelled = stagedImportRepository.findImportJobInScope(user, id);
  recordAudit(user, cancelled, "import_cancelled", safeRequestId);
  return getStagedImportJob(user, id);
}
