CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  created_by INTEGER NOT NULL REFERENCES owners(id),
  template_key TEXT NOT NULL CHECK(template_key IN ('branches','menu','costs','sales')),
  template_version INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('csv','xlsx')),
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  file_sha256 TEXT NOT NULL,
  confirmation_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview_ready' CHECK(status IN ('preview_ready','confirmed','cancelled')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  accepted_rows INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_scope
ON import_jobs(organization_id, restaurant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_import_jobs_file_hash
ON import_jobs(restaurant_id, template_key, file_sha256, status);

CREATE TABLE IF NOT EXISTS import_job_rows (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','rejected','duplicate')),
  raw_json TEXT NOT NULL,
  normalized_json TEXT,
  errors_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_import_job_rows_status
ON import_job_rows(job_id, status, row_number);

CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  item_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  selling_price_minor INTEGER NOT NULL CHECK(selling_price_minor >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_scope
ON catalog_items(organization_id, restaurant_id, item_code);

CREATE TABLE IF NOT EXISTS item_costs (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  branch_id INTEGER REFERENCES branches(id),
  catalog_item_id INTEGER NOT NULL REFERENCES catalog_items(id),
  scope_key TEXT NOT NULL,
  direct_food_cost_minor INTEGER NOT NULL CHECK(direct_food_cost_minor >= 0),
  packaging_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK(packaging_cost_minor >= 0),
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, catalog_item_id, scope_key, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_item_costs_lookup
ON item_costs(restaurant_id, catalog_item_id, branch_id, effective_from);

CREATE TABLE IF NOT EXISTS sales_lines (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  catalog_item_id INTEGER NOT NULL REFERENCES catalog_items(id),
  external_order_id TEXT NOT NULL,
  external_line_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('dine_in','takeaway','delivery')),
  quantity REAL NOT NULL CHECK(quantity > 0),
  gross_sales_minor INTEGER NOT NULL CHECK(gross_sales_minor >= 0),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK(discount_minor >= 0),
  refund_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK(refund_amount_minor >= 0),
  delivery_commission_minor INTEGER NOT NULL DEFAULT 0 CHECK(delivery_commission_minor >= 0),
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, branch_id, external_order_id, external_line_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_lines_scope_time
ON sales_lines(organization_id, restaurant_id, branch_id, created_at);
