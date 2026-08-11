import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrate } from "../db/migrate.js";

test("database migrations apply and are idempotent", () => {
  const db = new Database(":memory:");

  migrate(db);

  const first = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();

  assert.deepEqual(first, [{ version: "0001_migration_foundation.sql" }, { version: "0002_import_templates.sql" }]);

  migrate(db);

  const second = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();

  assert.deepEqual(second, first);

  db.close();
});

test("failed migration transaction does not record a version", () => {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const rows = db.prepare("SELECT * FROM schema_migrations").all();

  assert.equal(rows.length, 0);

  db.close();
});
