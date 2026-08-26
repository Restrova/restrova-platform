CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  branch_id INTEGER REFERENCES branches(id),
  category TEXT NOT NULL CHECK(category IN (
    'sales',
    'discounts',
    'refunds',
    'food_costs',
    'packaging',
    'delivery_commissions',
    'labor',
    'rent',
    'utilities',
    'marketing',
    'miscellaneous_operating_expenses'
  )),
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  currency_code TEXT NOT NULL CHECK(length(currency_code) = 3),
  occurred_at TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN ('manual','import','system')),
  source_reference TEXT NOT NULL,
  description TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES owners(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scope_key TEXT NOT NULL,
  CHECK(
    (period_start IS NULL AND period_end IS NULL)
    OR (period_start IS NOT NULL AND period_end IS NOT NULL)
  ),
  UNIQUE(
    organization_id,
    restaurant_id,
    scope_key,
    category,
    source_type,
    source_reference
  )
);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_scope_time
ON financial_ledger_entries(organization_id, restaurant_id, branch_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_category_time
ON financial_ledger_entries(restaurant_id, category, occurred_at);
