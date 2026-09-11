-- Opening/closing dates are operator-supplied evidence, never inferred from import time.
CREATE TABLE branch_lifecycle (
  branch_id INTEGER PRIMARY KEY REFERENCES branches(id),
  opened_on TEXT,
  closed_on TEXT,
  updated_by INTEGER NOT NULL REFERENCES owners(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (closed_on IS NULL OR (opened_on IS NOT NULL AND closed_on > opened_on))
);

-- Aggregators remain a delivery subtype, preserving existing channel contracts.
ALTER TABLE sales_lines ADD COLUMN aggregator_name TEXT;
UPDATE import_templates SET
  version=version+1,
  columns_json=json_insert(columns_json, '$[#]', json('{"name":"aggregator_name","required":false,"type":"string","description":"Delivery platform name, only for delivery sales. Leave empty for direct delivery."}')),
  updated_at=CURRENT_TIMESTAMP
WHERE template_key='sales';
