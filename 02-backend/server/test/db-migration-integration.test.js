import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("application database bootstrap records applied migrations", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "restrova-migration-"));
  const databasePath = path.join(tempDir, "restaurant.db");

  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.DATABASE_PATH = databasePath;
  process.env.NODE_ENV = "production";

  let db;

  try {
    const moduleUrl = new URL("../src/db.js", import.meta.url);
    moduleUrl.searchParams.set("migration-test", String(Date.now()));

    ({ db } = await import(moduleUrl.href));

    const migrations = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();

    assert.deepEqual(migrations, [
      { version: "0001_migration_foundation.sql" },
      { version: "0002_import_templates.sql" },
      { version: "0003_staged_imports.sql" },
      { version: "0004_import_mapping_validation.sql" },
      { version: "0005_import_audit_security.sql" }
    ]);
  } finally {
    if (db?.open) db.close();

    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
