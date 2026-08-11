import { db } from "../db.js";

const baseSelect = `
  SELECT id,template_key,version,display_name,description,columns_json,example_row_json,created_at,updated_at
  FROM import_templates
  WHERE active=1
`;

export function listActiveImportTemplates() {
  return db.prepare(`${baseSelect} ORDER BY template_key`).all();
}

export function findActiveImportTemplate(templateKey) {
  return db.prepare(`${baseSelect} AND template_key=?`).get(templateKey);
}
