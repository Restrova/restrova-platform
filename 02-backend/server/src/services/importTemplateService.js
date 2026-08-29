import { notFound, validationError } from "../errors/appError.js";
import { suggestColumnMappings } from "../import/columnMapping.js";
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

export function detectImportTemplate(headers) {
  const candidates = listImportTemplates()
    .map((template) => {
      const mappings = suggestColumnMappings(headers, template);
      const matchedFields = mappings.filter((mapping) => mapping.targetField).map((mapping) => mapping.targetField);
      const requiredMatched = template.requiredColumns.filter((field) => matchedFields.includes(field));
      const requiredCoverageBps = Math.round((requiredMatched.length * 10000) / template.requiredColumns.length);
      return {
        template,
        mappings,
        matchedFields,
        requiredMatched,
        requiredCoverageBps,
        score: requiredCoverageBps * 100 + matchedFields.length
      };
    })
    .sort((left, right) => right.score - left.score || left.template.key.localeCompare(right.template.key));

  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.matchedFields.length < 2 || best.requiredCoverageBps < 5000 || best.score === second?.score) {
    throw validationError(
      "The file type could not be identified confidently. Choose Branches, Menu, Costs, or Sales manually."
    );
  }

  return {
    template: best.template,
    mappings: best.mappings,
    detection: {
      mode: "automatic",
      templateKey: best.template.key,
      displayName: best.template.displayName,
      confidence: best.requiredCoverageBps === 10000 ? "high" : "medium",
      requiredCoverageBps: best.requiredCoverageBps,
      matchedFields: best.matchedFields,
      candidates: candidates.map((candidate) => ({
        templateKey: candidate.template.key,
        displayName: candidate.template.displayName,
        requiredCoverageBps: candidate.requiredCoverageBps,
        matchedFieldCount: candidate.matchedFields.length
      }))
    }
  };
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
