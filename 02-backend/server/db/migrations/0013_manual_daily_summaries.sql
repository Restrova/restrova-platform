CREATE TABLE IF NOT EXISTS manual_daily_summaries (
 id INTEGER PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 branch_id INTEGER NOT NULL REFERENCES branches(id),
 date TEXT NOT NULL,
 currency_code TEXT NOT NULL,
 sales_minor INTEGER NOT NULL CHECK(sales_minor>=0),
 orders INTEGER NOT NULL CHECK(orders>=0),
 costs_minor INTEGER NOT NULL CHECK(costs_minor>=0),
 waste_minor INTEGER NOT NULL CHECK(waste_minor>=0 AND waste_minor<=costs_minor),
 created_by INTEGER NOT NULL REFERENCES owners(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(organization_id,restaurant_id,branch_id,date)
);
