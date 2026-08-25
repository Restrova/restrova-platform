ALTER TABLE import_jobs
ADD COLUMN confirmation_token_expires_at TEXT;

ALTER TABLE import_jobs
ADD COLUMN confirmation_consumed_at TEXT;

ALTER TABLE import_jobs
ADD COLUMN last_request_id TEXT;

UPDATE import_jobs
SET confirmation_token_expires_at = datetime(created_at, '+30 minutes')
WHERE confirmation_token_expires_at IS NULL;

CREATE TABLE IF NOT EXISTS import_audit_events (
  id INTEGER PRIMARY KEY,
  import_job_id INTEGER NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  branch_id INTEGER REFERENCES branches(id),
  user_id INTEGER NOT NULL REFERENCES owners(id),
  template_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  request_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_audit_job_time
ON import_audit_events(import_job_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_import_audit_scope_time
ON import_audit_events(organization_id, restaurant_id, created_at, id);
