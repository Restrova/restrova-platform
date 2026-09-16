CREATE TABLE copilot_threads (
 id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
 owner_id INTEGER NOT NULL REFERENCES owners(id), branch_id INTEGER REFERENCES branches(id), scope TEXT NOT NULL CHECK(scope IN ('restaurant','branch')),
 title TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_copilot_threads_scope ON copilot_threads(organization_id,restaurant_id,owner_id,branch_id,id);
CREATE TABLE copilot_turns (
 id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL REFERENCES copilot_threads(id), question TEXT NOT NULL,
 response_json TEXT NOT NULL CHECK(json_valid(response_json)), request_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(thread_id,request_key)
);
CREATE INDEX idx_copilot_turns_thread ON copilot_turns(thread_id,id);
