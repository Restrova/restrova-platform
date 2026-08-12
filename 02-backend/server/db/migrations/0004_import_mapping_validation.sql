ALTER TABLE import_jobs
ADD COLUMN source_headers_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE import_jobs
ADD COLUMN mapping_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE import_jobs
ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'ready'
CHECK(validation_status IN ('needs_mapping','validation_failed','ready'));

ALTER TABLE import_jobs
ADD COLUMN warning_count INTEGER NOT NULL DEFAULT 0
CHECK(warning_count >= 0);

ALTER TABLE import_jobs
ADD COLUMN mapping_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_import_jobs_validation_status
ON import_jobs(organization_id,restaurant_id,validation_status,created_at);
