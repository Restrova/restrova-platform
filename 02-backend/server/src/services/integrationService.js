import { z } from "zod";
import { db } from "../db.js";
import { validate } from "../validation/schemas.js";
import { forbidden, notFound, validationError } from "../errors/appError.js";
import { getImportTemplate } from "./importTemplateService.js";
import {
  previewStagedImport,
  updateStagedImportMapping,
  getStagedImportJob,
  confirmStagedImport
} from "./stagedImportService.js";

function owner(user) {
  if (user.role !== "owner") throw forbidden("Only owners can manage connectors.");
}
function connector(user, id) {
  owner(user);
  const row = db
    .prepare("SELECT * FROM integration_connectors WHERE id=? AND organization_id=? AND restaurant_id=?")
    .get(id, user.organization_id, user.restaurant_id);
  if (!row) throw notFound("Connector not found");
  return row;
}
function visible(row) {
  return {
    id: row.id,
    name: row.name,
    adapter: row.adapter,
    templateKey: row.template_key,
    mappings: JSON.parse(row.mapping_json),
    createdAt: row.created_at,
    mode: "file_import",
    liveConnection: false
  };
}
export function listConnectors(user) {
  owner(user);
  return {
    connectors: db
      .prepare(
        "SELECT * FROM integration_connectors WHERE organization_id=? AND restaurant_id=? ORDER BY id DESC LIMIT 100"
      )
      .all(user.organization_id, user.restaurant_id)
      .map(visible),
    adapters: [{ id: "file_csv_v1", mode: "file_import", version: 1 }]
  };
}
export function createConnector(user, body) {
  owner(user);
  const parsed = validate(
    z
      .object({ name: z.string().trim().min(1).max(100), templateKey: z.enum(["branches", "menu", "costs", "sales"]) })
      .strict(),
    body
  );
  getImportTemplate(parsed.templateKey);
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM integration_connectors WHERE organization_id=? AND restaurant_id=?")
    .get(user.organization_id, user.restaurant_id).n;
  if (count >= 100) throw validationError("A restaurant can have at most 100 connectors.");
  const id = db
    .prepare(
      "INSERT INTO integration_connectors(organization_id,restaurant_id,created_by,name,adapter,template_key) VALUES (?,?,?,?,'file_csv_v1',?)"
    )
    .run(user.organization_id, user.restaurant_id, user.owner_id, parsed.name, parsed.templateKey).lastInsertRowid;
  return visible(connector(user, Number(id)));
}
export function previewConnector(user, id, { filename, buffer, requestId }) {
  const row = connector(user, id);
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 5 * 1024 * 1024)
    throw validationError("Provide a CSV file of at most 5 MB.");
  if (!String(filename).toLowerCase().endsWith(".csv")) throw validationError("This adapter accepts CSV exports only.");
  return db.transaction(() => {
    let job = previewStagedImport(user, {
      templateKey: row.template_key,
      filename,
      buffer,
      contentType: "text/csv",
      requestId
    });
    const mappings = JSON.parse(row.mapping_json);
    if (mappings.length) job = updateStagedImportMapping(user, job.id, mappings, requestId);
    db.prepare("INSERT INTO integration_runs(connector_id,import_job_id,created_by) VALUES (?,?,?)").run(
      row.id,
      job.id,
      user.owner_id
    );
    return { ...job, connectorId: row.id };
  })();
}
function run(user, id, jobId) {
  const row = connector(user, id);
  if (!db.prepare("SELECT id FROM integration_runs WHERE connector_id=? AND import_job_id=?").get(row.id, jobId))
    throw notFound("Connector import not found");
  return row;
}
export function mapConnector(user, id, jobId, body, requestId) {
  const row = run(user, id, jobId),
    { mappings } = validate(
      z
        .object({
          mappings: z
            .array(z.object({ sourceColumn: z.string().min(1).max(200), targetField: z.string().max(100).nullable() }))
            .max(100)
        })
        .strict(),
      body
    );
  return db.transaction(() => {
    const job = updateStagedImportMapping(user, jobId, mappings, requestId);
    db.prepare("UPDATE integration_connectors SET mapping_json=? WHERE id=?").run(JSON.stringify(mappings), row.id);
    return { ...job, connectorId: row.id };
  })();
}
export function confirmConnector(user, id, jobId, body, requestId) {
  run(user, id, jobId);
  const { confirmationToken } = validate(z.object({ confirmationToken: z.string().min(1).max(500) }).strict(), body);
  return confirmStagedImport(user, jobId, confirmationToken, requestId);
}
export function connectorHistory(user, id) {
  const row = connector(user, id);
  return {
    connector: visible(row),
    jobs: db
      .prepare("SELECT import_job_id AS id FROM integration_runs WHERE connector_id=? ORDER BY id DESC LIMIT 20")
      .all(row.id)
      .map((item) => getStagedImportJob(user, item.id))
  };
}
