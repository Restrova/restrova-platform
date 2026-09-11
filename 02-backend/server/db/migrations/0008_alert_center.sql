CREATE TABLE alert_preferences (
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 owner_id INTEGER NOT NULL REFERENCES owners(id),
 settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,owner_id)
);
CREATE TABLE alert_incidents (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 branch_id INTEGER NOT NULL REFERENCES branches(id),
 rule_type TEXT NOT NULL,
 period_key TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 assigned_to INTEGER REFERENCES owners(id),
 recurrence_count INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(organization_id,branch_id,rule_type,period_key)
);
CREATE INDEX idx_alert_incidents_scope ON alert_incidents(organization_id,restaurant_id,branch_id,status,id);
CREATE TABLE alert_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 alert_id INTEGER NOT NULL REFERENCES alert_incidents(id),
 actor_id INTEGER NOT NULL REFERENCES owners(id),
 action TEXT NOT NULL,
 detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_alert_history_alert ON alert_history(alert_id,id);
CREATE TABLE alert_deliveries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 alert_id INTEGER NOT NULL REFERENCES alert_incidents(id),
 owner_id INTEGER NOT NULL REFERENCES owners(id),
 channel TEXT NOT NULL CHECK(channel IN ('email','push','whatsapp','slack','teams')),
 window_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 locked_at TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at TEXT,
 UNIQUE(alert_id,owner_id,channel,window_key)
);
CREATE INDEX idx_alert_deliveries_due ON alert_deliveries(organization_id,status,next_attempt_at,id);
