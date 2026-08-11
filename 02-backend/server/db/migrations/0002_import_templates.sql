CREATE TABLE IF NOT EXISTS import_templates (
  id INTEGER PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE CHECK(template_key IN ('branches','menu','costs','sales')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  columns_json TEXT NOT NULL,
  example_row_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_templates_active
ON import_templates(active, template_key);

INSERT OR IGNORE INTO import_templates(template_key,version,display_name,description,columns_json,example_row_json)
VALUES
(
  'branches',
  1,
  'Branches',
  'Create or update restaurant branches before importing menu, costs, or sales.',
  '[{"name":"branch_code","required":true,"type":"string","description":"Unique branch code inside the organization."},{"name":"name","required":true,"type":"string","description":"Branch display name. UTF-8 Arabic and Chinese are supported."},{"name":"city","required":true,"type":"string","description":"City name."},{"name":"address","required":false,"type":"string","description":"Street or location description."},{"name":"phone","required":false,"type":"string","description":"Branch contact number."},{"name":"pos_system","required":false,"type":"string","description":"Source POS/cashier system name."},{"name":"operating_day_start","required":false,"type":"time","description":"HH:MM. Defaults to 10:00."},{"name":"operating_day_end","required":false,"type":"time","description":"HH:MM and may be after midnight, for example 02:00."}]',
  '{"branch_code":"GZ-01","name":"فرع قوانغتشو","city":"Guangzhou","address":"Tianhe District","phone":"+86-000-0000","pos_system":"Example POS","operating_day_start":"10:00","operating_day_end":"02:00"}'
),
(
  'menu',
  1,
  'Menu',
  'Define menu items and selling prices. Cost history is imported separately through the costs template.',
  '[{"name":"item_code","required":true,"type":"string","description":"Stable unique item code used by costs and sales files."},{"name":"name","required":true,"type":"string","description":"Menu item name. UTF-8 Arabic and Chinese are supported."},{"name":"category","required":false,"type":"string","description":"Menu category used for filtering and reporting."},{"name":"selling_price","required":true,"type":"money","description":"Current selling price in the restaurant currency."},{"name":"active","required":false,"type":"boolean","description":"true or false. Defaults to true."}]',
  '{"item_code":"MANDI-CHICKEN","name":"مندي دجاج","category":"Mandi","selling_price":"48.00","active":"true"}'
),
(
  'costs',
  1,
  'Costs',
  'Define effective-dated direct food and packaging costs for menu items.',
  '[{"name":"item_code","required":true,"type":"string","description":"Must match an existing menu item code."},{"name":"branch_code","required":false,"type":"string","description":"Optional branch-specific cost. Leave empty for restaurant-wide cost."},{"name":"direct_food_cost","required":true,"type":"money","description":"Direct food cost per sold unit."},{"name":"packaging_cost","required":false,"type":"money","description":"Packaging cost per sold unit. Defaults to 0 when explicitly supplied as empty by the importer rules."},{"name":"effective_from","required":true,"type":"datetime","description":"ISO-compatible effective date. +08:00 timezone offsets are supported."}]',
  '{"item_code":"MANDI-CHICKEN","branch_code":"GZ-01","direct_food_cost":"24.00","packaging_cost":"1.50","effective_from":"2026-08-01T00:00:00+08:00"}'
),
(
  'sales',
  1,
  'Sales',
  'Import item-level sales rows with stable external identifiers for duplicate prevention and deterministic financial calculations.',
  '[{"name":"external_order_id","required":true,"type":"string","description":"Stable order identifier from the source system."},{"name":"external_line_id","required":true,"type":"string","description":"Stable line identifier inside the source order."},{"name":"branch_code","required":true,"type":"string","description":"Must match an existing branch code."},{"name":"created_at","required":true,"type":"datetime","description":"ISO-compatible sale timestamp. +08:00 timezone offsets are supported."},{"name":"channel","required":true,"type":"enum","description":"dine_in, takeaway, or delivery."},{"name":"item_code","required":true,"type":"string","description":"Must match an existing menu item code."},{"name":"quantity","required":true,"type":"number","description":"Quantity sold and must be greater than zero."},{"name":"gross_sales","required":true,"type":"money","description":"Gross sales for this line before discounts and refunds."},{"name":"discount","required":false,"type":"money","description":"Discount amount for this line. Defaults to 0."},{"name":"refund_amount","required":false,"type":"money","description":"Refund amount associated with this line. Defaults to 0."},{"name":"delivery_commission","required":false,"type":"money","description":"Delivery commission for this line; should be 0 outside delivery channel."}]',
  '{"external_order_id":"POS-10001","external_line_id":"1","branch_code":"GZ-01","created_at":"2026-08-10T19:30:00+08:00","channel":"dine_in","item_code":"MANDI-CHICKEN","quantity":"2","gross_sales":"96.00","discount":"0.00","refund_amount":"0.00","delivery_commission":"0.00"}'
);
