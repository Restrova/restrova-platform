CREATE TABLE data_revisions (
 organization_id INTEGER NOT NULL REFERENCES organizations(id), restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,restaurant_id)
);
CREATE TABLE seasonal_events (
 id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 branch_id INTEGER REFERENCES branches(id), kind TEXT NOT NULL CHECK(kind IN ('ramadan','eid','weekend','holiday','local_event','restaurant')),
 name TEXT NOT NULL, from_date TEXT NOT NULL, to_date TEXT NOT NULL, source TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES owners(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(from_date<=to_date)
);
CREATE INDEX idx_seasonal_events_scope_dates ON seasonal_events(organization_id,restaurant_id,branch_id,from_date,to_date);
CREATE TABLE forecast_snapshots (
 id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 branch_id INTEGER NOT NULL REFERENCES branches(id), created_by INTEGER NOT NULL REFERENCES owners(id), created_at TEXT NOT NULL,
 horizon INTEGER NOT NULL, revision INTEGER NOT NULL, forecast_json TEXT NOT NULL CHECK(json_valid(forecast_json)),
 UNIQUE(organization_id,branch_id,created_at,horizon)
);
CREATE INDEX idx_forecast_snapshots_scope ON forecast_snapshots(organization_id,restaurant_id,branch_id,id);
CREATE TABLE recommendation_actions (
 id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 branch_id INTEGER NOT NULL REFERENCES branches(id), recommendation_key TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','action_taken','measured','rejected')),
 version INTEGER NOT NULL DEFAULT 1, created_by INTEGER NOT NULL REFERENCES owners(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 accepted_at TEXT, action_at TEXT, measured_at TEXT, result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 UNIQUE(organization_id,branch_id,recommendation_key)
);
CREATE TABLE recommendation_history (
 id INTEGER PRIMARY KEY, recommendation_id INTEGER NOT NULL REFERENCES recommendation_actions(id), actor_id INTEGER NOT NULL REFERENCES owners(id),
 action TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_recommendation_actions_scope ON recommendation_actions(organization_id,restaurant_id,branch_id,id);
CREATE INDEX idx_recommendation_history ON recommendation_history(recommendation_id,id);
ALTER TABLE item_costs ADD COLUMN supplier_name TEXT;
UPDATE import_templates SET version=version+1,columns_json=json_insert(columns_json,'$[#]',json('{"name":"supplier_name","required":false,"type":"string","description":"Supplier attribution, when known. Never inferred from prices."}')),updated_at=CURRENT_TIMESTAMP WHERE template_key='costs';
