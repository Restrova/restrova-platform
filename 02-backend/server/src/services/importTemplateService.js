import { notFound } from "../errors/appError.js";
import * as importTemplateRepository from "../repositories/importTemplateRepository.js";
import { importTemplateKeySchema, validate } from "../validation/schemas.js";

function mapTemplate(row) {
  const columns = JSON.parse(row.columns_json);
  return {
    id: row.id,
    key: row.template_key,
    version: row.version,
    displayName: row.display_name,
    description: row.description,
    columns,
    requiredColumns: columns.filter((column) => column.required).map((column) => column.name),
    optionalColumns: columns.filter((column) => !column.required).map((column) => column.name),
    exampleRow: JSON.parse(row.example_row_json),
    downloadPath: `/api/data/templates/${row.template_key}/download`,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getTemplateRow(templateKey) {
  const key = validate(importTemplateKeySchema, templateKey);
  const row = importTemplateRepository.findActiveImportTemplate(key);
  if (!row) throw notFound("Import template not found");
  return row;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function listImportTemplates() {
  return importTemplateRepository.listActiveImportTemplates().map(mapTemplate);
}

export function getImportTemplate(templateKey) {
  return mapTemplate(getTemplateRow(templateKey));
}

export function buildImportTemplateCsv(templateKey) {
  const template = mapTemplate(getTemplateRow(templateKey));
  const header = template.columns.map((column) => escapeCsvCell(column.name)).join(",");
  return {
    filename: `restrova-${template.key}-template-v${template.version}.csv`,
    contentType: "text/csv; charset=utf-8",
    // UTF-8 BOM improves compatibility when the file is opened in spreadsheet apps with Arabic/Chinese data.
    body: `\uFEFF${header}\n`
  };
}
