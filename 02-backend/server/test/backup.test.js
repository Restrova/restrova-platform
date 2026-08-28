import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { createBackup, verifyBackup, restoreBackup, pruneBackups } = await import("../src/backup.js");
const { db } = await import("../src/db.js");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));

async function request(server, pathName, { token, method = "GET", body } = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${pathName}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

test("backup: live database backup while the server is serving, then verified restore", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  // Realistic data: a registered owner plus orders and a chat session.
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `backup-${stamp}@example.test`;
  const registered = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Backup Owner",
      email,
      password: "demo12345",
      organizationName: `Backup Org ${stamp}`,
      restaurantName: `Backup Restaurant ${stamp}`,
      branchName: "Main",
      branchCode: `BU${stamp.slice(-6)}`,
      city: "Aden",
      currency: "YER",
      timezone: "Asia/Aden"
    }
  });
  assert.equal(registered.status, 201);
  const restaurantId = registered.payload.restaurant.id;
  const token = registered.payload.token;

  for (let i = 0; i < 5; i += 1) {
    db.prepare("INSERT INTO orders (restaurant_id, items, total_price, cost, created_at) VALUES (?,?,?,?,?)").run(
      restaurantId,
      JSON.stringify([{ name: "Saltah", quantity: 2, price: 2500 }]),
      5000,
      1800,
      new Date().toISOString()
    );
  }
  const chat = await request(server, "/api/chat", {
    token,
    method: "POST",
    body: { message: "How were sales today?" }
  });
  assert.equal(chat.status, 200);

  const ownersBefore = db.prepare("SELECT COUNT(*) n FROM owners").get().n;
  const ordersBefore = db.prepare("SELECT COUNT(*) n FROM orders").get().n;

  // Backup WHILE the server keeps running (WAL-safe snapshot).
  const backupDir = path.join(tempDir, "backups");
  const backup = createBackup({ outputDir: backupDir });
  assert.ok(fs.existsSync(backup.path));
  assert.ok(fs.statSync(backup.path).size > 0);
  assert.ok(fs.existsSync(`${backup.path}.sha256`));

  // The backup verifies cleanly: checksum, integrity, row counts.
  const verification = verifyBackup(backup.path);
  assert.equal(verification.integrityCheck, "ok");
  assert.equal(verification.checksumOk, true);
  assert.equal(verification.rowCounts.owners, ownersBefore);
  assert.equal(verification.rowCounts.orders, ordersBefore);
  assert.ok(verification.rowCounts.chat_sessions >= 1);

  // Restore the backup to a new path and verify the data is intact.
  const restoredPath = path.join(tempDir, "restored.db");
  const restore = restoreBackup({ backupPath: backup.path, destinationPath: restoredPath });
  assert.equal(restore.verification.integrityCheck, "ok");
  assert.equal(restore.verification.rowCounts.owners, ownersBefore);
  assert.equal(restore.verification.rowCounts.orders, ordersBefore);

  // The restored file is a working database: credentials survive and the
  // owner can authenticate against it.
  const Database = (await import("better-sqlite3")).default;
  const restoredDb = new Database(restoredPath, { readonly: true });
  const ownerRow = restoredDb.prepare("SELECT email FROM owners WHERE email=?").get(email);
  restoredDb.close();
  assert.ok(ownerRow, "restored database contains the registered owner");

  // Restore refuses to overwrite without --force.
  assert.throws(() => restoreBackup({ backupPath: backup.path, destinationPath: restoredPath }), /already exists/);
  // With force it succeeds.
  const forced = restoreBackup({ backupPath: backup.path, destinationPath: restoredPath, force: true });
  assert.equal(forced.verification.integrityCheck, "ok");
});

test("backup: corrupted backup fails verification instead of restoring silently", async () => {
  const sourceBackup = path.join(tempDir, "backups");
  const backup = createBackup({ outputDir: sourceBackup });
  const corruptedPath = path.join(tempDir, "corrupted.db");
  fs.copyFileSync(backup.path, corruptedPath);
  fs.writeFileSync(corruptedPath, Buffer.concat([fs.readFileSync(corruptedPath), Buffer.from("tampered")]));
  fs.copyFileSync(`${backup.path}.sha256`, `${corruptedPath}.sha256`);
  assert.throws(() => verifyBackup(corruptedPath), /checksum mismatch/);
  assert.throws(
    () => restoreBackup({ backupPath: corruptedPath, destinationPath: path.join(tempDir, "nope.db") }),
    /checksum mismatch/
  );
});

test("backup: retention keeps only the newest backups", () => {
  const dir = path.join(tempDir, "retention");
  fs.mkdirSync(dir, { recursive: true });
  for (const stamp of ["20260101-000000", "20260102-000000", "20260103-000000", "20260104-000000"]) {
    const file = path.join(dir, `restaurant-backup-${stamp}.db`);
    fs.writeFileSync(file, "x");
    fs.writeFileSync(`${file}.sha256`, "y\n");
  }
  const pruned = pruneBackups(dir, 2);
  assert.equal(pruned.removed.length, 2);
  const remaining = fs.readdirSync(dir).filter((name) => name.endsWith(".db"));
  assert.deepEqual(remaining, ["restaurant-backup-20260103-000000.db", "restaurant-backup-20260104-000000.db"]);
  // Sidecars removed too.
  assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith(".sha256")).length, 2);
});
