CREATE TABLE report_schedules (
 id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id),
 restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), created_by INTEGER NOT NULL REFERENCES owners(id),
 branch_id INTEGER REFERENCES branches(id), cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),
 language TEXT NOT NULL CHECK(language IN ('ar','en','zh')), timezone TEXT NOT NULL,
 hour INTEGER NOT NULL CHECK(hour BETWEEN 0 AND 23), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 next_run_at TEXT NOT NULL, retry_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_report_schedules_due ON report_schedules(enabled,next_run_at,retry_at);
CREATE INDEX idx_report_schedules_scope ON report_schedules(organization_id,restaurant_id,created_by);
CREATE TABLE scheduled_report_runs (
 id INTEGER PRIMARY KEY, schedule_id INTEGER NOT NULL REFERENCES report_schedules(id),
 scheduled_for TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ready','failed')),
 attempts INTEGER NOT NULL DEFAULT 1, report_json TEXT CHECK(report_json IS NULL OR json_valid(report_json)),
 error_code TEXT, generated_at TEXT NOT NULL, UNIQUE(schedule_id,scheduled_for)
);
