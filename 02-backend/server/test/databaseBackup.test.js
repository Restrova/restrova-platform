import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { db } from "../src/db.js";
import { createDatabaseBackup, restoreDatabaseBackup } from "../src/services/databaseBackup.js";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restrova-backup-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    source: path.join(directory, "live.db"),
    destination: path.join(directory, "archive.restrova-backup"),
    restored: path.join(directory, "restored.db"),
    key: randomBytes(32).toString("hex")
  };
}

test("encrypted online backup restores committed WAL rows and preserves separate tenants", async (t) => {
  const f = fixture(t);
  const live = new Database(f.source);
  t.after(() => live.close());
  live.pragma("journal_mode = WAL");
  live.pragma("wal_autocheckpoint = 0");
  live.exec("CREATE TABLE records (tenant INTEGER, amount INTEGER, label TEXT)");
  live.prepare("INSERT INTO records VALUES (?,?,?)").run(1, 12050, "مطعم أول");
  live.prepare("INSERT INTO records VALUES (?,?,?)").run(2, 9500, "第二家餐厅");
  assert.ok(fs.statSync(f.source + "-wal").size > 0);
  await createDatabaseBackup(f);
  live.prepare("INSERT INTO records VALUES (?,?,?)").run(1, 200, "After snapshot");
  assert.equal(fs.readFileSync(f.destination).includes(Buffer.from("مطعم أول")), false);
  assert.equal(fs.statSync(f.destination).mode & 0o777, 0o600);
  await restoreDatabaseBackup({ source: f.destination, destination: f.restored, key: f.key });
  const restored = new Database(f.restored, { readonly: true });
  try {
    assert.deepEqual(restored.prepare("SELECT tenant, sum(amount) total FROM records GROUP BY tenant").all(), [
      { tenant: 1, total: 12050 },
      { tenant: 2, total: 9500 }
    ]);
    assert.equal(restored.prepare("SELECT label FROM records WHERE tenant=2").get().label, "第二家餐厅");
    assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    restored.close();
  }
  assert.equal(fs.statSync(f.restored).mode & 0o777, 0o600);
  assert.equal(
    fs.readdirSync(f.directory).some((name) => name.startsWith(".restrova-")),
    false
  );
});

test("full application restore retains every table, schema, accounts and scheduled-report state", async (t) => {
  const f = fixture(t);
  await db.backup(f.source);
  const live = new Database(f.source);
  t.after(() => live.close());
  const restaurant = live.prepare("SELECT id,organization_id,owner_id FROM restaurants ORDER BY id LIMIT 1").get();
  const scheduleId = live
    .prepare(
      "INSERT INTO report_schedules (organization_id,restaurant_id,created_by,cadence,language,timezone,hour,next_run_at) VALUES (?,?,?,'daily','ar','Asia/Riyadh',20,'2026-10-05T17:00:00Z')"
    )
    .run(restaurant.organization_id, restaurant.id, restaurant.owner_id).lastInsertRowid;
  live
    .prepare(
      "INSERT INTO scheduled_report_runs (schedule_id,scheduled_for,status,report_json,generated_at) VALUES (?,'2026-10-04T17:00:00Z','ready',?,'2026-10-04T17:00:00Z')"
    )
    .run(scheduleId, JSON.stringify({ sales: 12050, orders: 90, insight: "بيانات تجريبية" }));
  const tables = live.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const counts = tables.map(({ name }) => live.prepare(`SELECT count(*) n FROM "${name}"`).get().n);
  await createDatabaseBackup(f);
  await restoreDatabaseBackup({ source: f.destination, destination: f.restored, key: f.key });
  const restored = new Database(f.restored, { readonly: true });
  try {
    assert.deepEqual(
      restored.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(),
      tables
    );
    assert.deepEqual(
      tables.map(({ name }) => restored.prepare(`SELECT count(*) n FROM "${name}"`).get().n),
      counts
    );
    for (const name of [
      "owners",
      "organization_users",
      "import_jobs",
      "financial_ledger_entries",
      "report_schedules",
      "scheduled_report_runs"
    ]) {
      assert.ok(tables.some((table) => table.name === name));
    }
    for (const table of [
      "owners",
      "organization_users",
      "report_schedules",
      "scheduled_report_runs",
      "schema_migrations",
      "orders"
    ]) {
      assert.deepEqual(
        restored.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
        live.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()
      );
    }
    assert.deepEqual(
      restored
        .prepare("SELECT restaurant_id,sum(total_price) revenue,sum(cost) cost FROM orders GROUP BY restaurant_id")
        .all(),
      live
        .prepare("SELECT restaurant_id,sum(total_price) revenue,sum(cost) cost FROM orders GROUP BY restaurant_id")
        .all()
    );
  } finally {
    restored.close();
  }
});

test("wrong key and tampering never publish plaintext or leave temporary files", async (t) => {
  const f = fixture(t);
  await createDatabaseBackup({ ...f, source: process.env.DATABASE_PATH });
  await assert.rejects(
    restoreDatabaseBackup({ source: f.destination, destination: f.restored, key: randomBytes(32).toString("hex") })
  );
  const data = fs.readFileSync(f.destination);
  data[Math.floor(data.length / 2)] ^= 1;
  fs.writeFileSync(f.destination, data);
  await assert.rejects(restoreDatabaseBackup({ source: f.destination, destination: f.restored, key: f.key }));
  assert.equal(fs.existsSync(f.restored), false);
  assert.equal(
    fs.readdirSync(f.directory).some((name) => name.startsWith(".restrova-")),
    false
  );
});

test("backup and restore refuse to replace existing databases and WAL sidecars", async (t) => {
  const f = fixture(t);
  await createDatabaseBackup({ ...f, source: process.env.DATABASE_PATH });
  const original = fs.readFileSync(f.destination);
  await assert.rejects(createDatabaseBackup({ ...f, source: process.env.DATABASE_PATH }), /BACKUP_TARGET_EXISTS/);
  assert.deepEqual(fs.readFileSync(f.destination), original);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.writeFileSync(f.restored + suffix, "KEEP");
    await assert.rejects(
      restoreDatabaseBackup({ source: f.destination, destination: f.restored, key: f.key }),
      /BACKUP_TARGET_EXISTS/
    );
    assert.equal(fs.readFileSync(f.restored + suffix, "utf8"), "KEEP");
    fs.unlinkSync(f.restored + suffix);
  }
});

test("invalid key, missing source, truncated backup and foreign-key corruption fail safely", async (t) => {
  const f = fixture(t);
  await assert.rejects(createDatabaseBackup({ ...f, key: "short" }), /BACKUP_KEY_INVALID/);
  await assert.rejects(createDatabaseBackup(f));
  assert.equal(fs.existsSync(f.source), false);
  fs.writeFileSync(f.destination, "RESTROVA-BACKUP-1\n");
  await assert.rejects(
    restoreDatabaseBackup({ source: f.destination, destination: f.restored, key: f.key }),
    /BACKUP_FORMAT_INVALID/
  );
  fs.unlinkSync(f.destination);
  const bad = new Database(f.source);
  bad.pragma("foreign_keys = OFF");
  bad.exec(
    "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(42)"
  );
  bad.close();
  await assert.rejects(createDatabaseBackup(f), /BACKUP_FOREIGN_KEYS_FAILED/);
  assert.equal(fs.existsSync(f.destination), false);
});

test("operator CLI redacts key and paths on failure and exits nonzero", (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ["scripts/database-backup.js", "create", f.source, f.destination], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, RESTROVA_BACKUP_KEY: f.key },
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, "BACKUP_OPERATION_FAILED");
  assert.equal(result.stderr.includes(f.key), false);
  assert.equal(result.stderr.includes(f.directory), false);
});
