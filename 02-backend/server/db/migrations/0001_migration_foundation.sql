-- Restrova migration foundation.
-- Existing application schema is still bootstrapped by src/db.js.
-- Table migrations will be moved here incrementally in later versions.

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
ON schema_migrations(applied_at);
