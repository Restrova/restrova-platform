CREATE TABLE IF NOT EXISTS report_export_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  owner_id INTEGER NOT NULL REFERENCES owners(id),
  branch_id INTEGER REFERENCES branches(id),
  report_kind TEXT NOT NULL CHECK(report_kind IN ('financial','branches','menu','ledger')),
  format TEXT NOT NULL CHECK(format IN ('csv','xlsx')),
  row_count INTEGER NOT NULL,
  report_digest TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_report_exports_scope ON report_export_events(organization_id,restaurant_id,created_at);
