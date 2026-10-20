-- Bearer tokens require a durable, revocable session. Deleting a membership
-- invalidates its sessions even if that identity is subsequently invited again.
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
  revoked_at INTEGER
);

CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);
