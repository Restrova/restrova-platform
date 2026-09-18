CREATE TABLE integration_connectors (
 id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 created_by INTEGER NOT NULL REFERENCES owners(id), name TEXT NOT NULL, adapter TEXT NOT NULL CHECK(adapter='file_csv_v1'),
 template_key TEXT NOT NULL, mapping_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(mapping_json)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_integration_connectors_scope ON integration_connectors(organization_id,restaurant_id,id);
CREATE TABLE integration_runs (
 id INTEGER PRIMARY KEY, connector_id INTEGER NOT NULL REFERENCES integration_connectors(id), import_job_id INTEGER NOT NULL REFERENCES import_jobs(id),
 created_by INTEGER NOT NULL REFERENCES owners(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(import_job_id)
);
CREATE INDEX idx_integration_runs_connector ON integration_runs(connector_id,id);
