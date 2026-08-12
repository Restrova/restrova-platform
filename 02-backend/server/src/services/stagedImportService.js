import crypto from "node:crypto";
import { conflict, forbidden, notFound, validationError } from "../errors/appError.js";
import { parseUploadedTable } from "../import/stagedFileParser.js";
import * as stagedImportRepository from "../repositories/stagedImportRepository.js";
import { getImportTemplate } from "./importTemplateService.js";

const MAX_FILENAME_LENGTH = 255;

function rowError(field, code, message) {
  return { field, code, message };
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
    errors.push(rowError(field, "required", `${field} is required.`));
    return "";
  }
  if (value.length > max) errors.push(rowError(field, "too_long", `${field} is too long.`));
  return value;
}

function optionalText(row, field, max = 240, errors = []) {
  const value = String(row[field] ?? "").trim();
  if (value.length > max) errors.push(rowError(field, "too_long", `${field} is too long.`));
  return value;
}

function parseMoneyMinor(value, field, errors, { required = true, defaultMinor = 0 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) errors.push(rowError(field, "required", `${field} is required.`));
    return defaultMinor;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    errors.push(rowError(field, "invalid_money", `${field} must be a non-negative amount with at most 2 decimals.`));
    return defaultMinor;
  }
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    errors.push(rowError(field, "money_too_large", `${field} is too large.`));
    return defaultMinor;
  }
  return Number(minor);
}

function parsePositiveNumber(value, field, errors) {
  const text = String(value ?? "").trim();
  if (!text) {
    errors.push(rowError(field, "required", `${field} is required.`));
    return 0;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(rowError(field, "invalid_number", `${field} must be greater than zero.`));
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
  errors.push(rowError(field, "invalid_boolean", `${field} must be true or false.`));
  return defaultValue;
}

function parseTime(value, field, errors, defaultValue) {
  const text = String(value ?? "").trim();
  if (!text) return defaultValue;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    errors.push(rowError(field, "invalid_time", `${field} must use HH:MM.`));
    return defaultValue;
  }
  return text;
}

function parseDateTime(value, field, errors) {
  const text = String(value ?? "").trim();
  if (!text) {
    errors.push(rowError(field, "required", `${field} is required.`));
    return "";
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(rowError(field, "invalid_datetime", `${field} must be an ISO-compatible date/time.`));
    return "";
  }
  return parsed.toISOString();
}

function validateHeaders(template, headers) {
  const allowed = new Set(template.columns.map((column) => column.name));
  const required = template.requiredColumns;
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length) throw validationError(`Missing required columns: ${missing.join(", ")}.`);
  const unknown = headers.filter((column) => !allowed.has(column));
  if (unknown.length) throw validationError(`Unknown columns: ${unknown.join(", ")}.`);
}

function validateBranchRow(row, seen) {
  const errors = [];
  const branchCode = requiredText(row, "branch_code", errors, 40);
  const key = branchCode.toLowerCase();
  if (branchCode && seen.has(key))
    errors.push(rowError("branch_code", "duplicate_in_file", "branch_code is duplicated in this file."));
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
  if (itemCode && seen.has(key))
    errors.push(rowError("item_code", "duplicate_in_file", "item_code is duplicated in this file."));
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
  if (itemCode && !item)
    errors.push(rowError("item_code", "unknown_item", "item_code does not match an imported menu item."));
  const branch = branchCode ? stagedImportRepository.findBranchByCode(user, branchCode) : null;
  if (branchCode && !branch)
    errors.push(rowError("branch_code", "missing_branch", "branch_code does not match a restaurant branch."));
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
    duplicateMessage: duplicate ? rowError("effective_from", "duplicate", "This cost record already exists.") : null,
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
  if (branchCode && !branch)
    errors.push(rowError("branch_code", "missing_branch", "branch_code does not match a restaurant branch."));
  if (itemCode && !item)
    errors.push(rowError("item_code", "unknown_item", "item_code does not match an imported menu item."));
  const channel = String(row.channel ?? "")
    .trim()
    .toLowerCase();
  if (!["dine_in", "takeaway", "delivery"].includes(channel))
    errors.push(rowError("channel", "invalid_channel", "channel must be dine_in, takeaway, or delivery."));
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
      ? rowError("external_line_id", "duplicate", "This sales line was already imported.")
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

function validateRows(user, templateKey, rows) {
  const seen = new Set();
  return rows.map((raw, index) => {
    let result;
    if (templateKey === "branches") result = validateBranchRow(raw, seen);
    else if (templateKey === "menu") result = validateMenuRow(raw, seen);
    else if (templateKey === "costs") result = validateCostRow(user, raw, seen);
    else result = validateSalesRow(user, raw, seen);

    const errors = [...result.errors];
    let status = "accepted";
    if (errors.length) status = "rejected";
    else if (result.duplicate) {
      status = "duplicate";
      if (result.duplicateMessage) errors.push(result.duplicateMessage);
    }
    return { rowNumber: index + 2, raw, normalized: result.normalized, errors, status };
  });
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function publicJob(job, rows) {
  const parsedRows = rows.map(parseStoredRow);
  return {
    id: job.id,
    templateKey: job.template_key,
    templateVersion: job.template_version,
    status: job.status,
    file: {
      name: job.original_filename,
      type: job.file_type,
      contentType: job.content_type,
      byteSize: job.byte_size,
      sha256: job.file_sha256
    },
    statistics: {
      total: job.total_rows,
      accepted: job.accepted_rows,
      rejected: job.rejected_rows,
      duplicates: job.duplicate_rows,
      imported: job.imported_rows
    },
    previewRows: parsedRows.slice(0, 20),
    rowErrors: parsedRows
      .filter((row) => row.errors.length)
      .slice(0, 200)
      .map((row) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        errors: row.errors
      })),
    createdAt: job.created_at,
    confirmedAt: job.confirmed_at,
    cancelledAt: job.cancelled_at
  };
}

export function previewStagedImport(user, { templateKey, filename, contentType, buffer }) {
  const template = getImportTemplate(templateKey);
  const originalFilename = cleanFilename(filename);
  const parsed = parseUploadedTable({ buffer, filename: originalFilename, contentType });
  validateHeaders(template, parsed.headers);
  const stagedRows = validateRows(user, template.key, parsed.rows);
  const counts = stagedRows.reduce(
    (result, row) => {
      result.total += 1;
      if (row.status === "accepted") result.accepted += 1;
      if (row.status === "rejected") result.rejected += 1;
      if (row.status === "duplicate") result.duplicates += 1;
      return result;
    },
    { total: 0, accepted: 0, rejected: 0, duplicates: 0 }
  );
  const confirmationToken = crypto.randomBytes(32).toString("base64url");
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
    totalRows: counts.total,
    acceptedRows: counts.accepted,
    rejectedRows: counts.rejected,
    duplicateRows: counts.duplicates
  });
  stagedImportRepository.insertImportJobRows(jobId, stagedRows);
  const job = stagedImportRepository.findImportJobInScope(user, jobId);
  return { ...publicJob(job, stagedImportRepository.listImportJobRows(jobId)), confirmationToken };
}

export function getStagedImportJob(user, jobId) {
  const id = Number(jobId);
  if (!Number.isInteger(id) || id <= 0) throw notFound("Import job not found");
  const job = stagedImportRepository.findImportJobInScope(user, id);
  if (!job) throw notFound("Import job not found");
  return publicJob(job, stagedImportRepository.listImportJobRows(id));
}

function assertConfirmationToken(job, confirmationToken) {
  if (!confirmationToken || typeof confirmationToken !== "string") throw forbidden("Invalid confirmation token");
  const supplied = Buffer.from(hash(confirmationToken), "hex");
  const expected = Buffer.from(job.confirmation_token_hash, "hex");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected))
    throw forbidden("Invalid confirmation token");
}

export function confirmStagedImport(user, jobId, confirmationToken) {
  const id = Number(jobId);
  const job = Number.isInteger(id) ? stagedImportRepository.findImportJobInScope(user, id) : null;
  if (!job) throw notFound("Import job not found");
  if (job.status !== "preview_ready") throw conflict(`Import job is already ${job.status}.`);
  assertConfirmationToken(job, confirmationToken);
  const rows = stagedImportRepository.listImportJobRows(id).map(parseStoredRow);
  const accepted = rows.filter((row) => row.status === "accepted");

  let importedRows = 0;
  stagedImportRepository.transaction(() => {
    const current = stagedImportRepository.findImportJobInScope(user, id);
    if (!current || current.status !== "preview_ready") throw conflict("Import job is no longer available to confirm.");
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
    if (!stagedImportRepository.markImportJobConfirmed(id, importedRows))
      throw conflict("Import job is no longer available to confirm.");
  });

  return getStagedImportJob(user, id);
}

export function cancelStagedImport(user, jobId) {
  const id = Number(jobId);
  const job = Number.isInteger(id) ? stagedImportRepository.findImportJobInScope(user, id) : null;
  if (!job) throw notFound("Import job not found");
  if (job.status !== "preview_ready") throw conflict(`Import job is already ${job.status}.`);
  if (!stagedImportRepository.cancelImportJob(id)) throw conflict("Import job is no longer available to cancel.");
  return getStagedImportJob(user, id);
}
