import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import {
  checkOffsiteBackup,
  createS3ObjectStore,
  fetchOffsiteBackup,
  readOffsiteBackupConfig,
  retentionCandidates,
  runOffsiteBackup
} from "../src/services/offsiteBackup.js";

const now = new Date("2026-10-19T02:00:00.000Z");
const archiveKey = (date) =>
  `production/${date.replace(/[:.]/g, "-")}-00000000-0000-4000-8000-000000000000.restrova-backup`;

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restrova-offsite-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "live.db");
  const database = new Database(source);
  database.exec("CREATE TABLE records(tenant INTEGER, amount INTEGER, label TEXT)");
  database.prepare("INSERT INTO records VALUES(?,?,?)").run(1, 12050, "مطعم أول");
  database.prepare("INSERT INTO records VALUES(?,?,?)").run(2, 9500, "Second restaurant");
  database.close();
  const config = {
    source,
    directory: path.join(directory, "work"),
    bucket: "restrova-private-backups",
    prefix: "production",
    region: "me-south-1",
    key: randomBytes(32).toString("hex"),
    keyVersion: "v1"
  };
  const objects = new Map();
  const verified = new Set();
  const calls = [];
  const store = {
    async put(key, file) {
      calls.push(["put", key]);
      objects.set(key, fs.readFileSync(file));
    },
    async get(key, file) {
      calls.push(["get", key]);
      fs.writeFileSync(file, objects.get(key), { flag: "wx", mode: 0o600 });
    },
    async list() {
      calls.push(["list"]);
      return [...objects.keys()].filter((key) => verified.has(key));
    },
    async markVerified(key) {
      calls.push(["markVerified", key]);
      verified.add(key);
    },
    async remove(key) {
      calls.push(["remove", key]);
      objects.delete(key);
    }
  };
  return { directory, config, store, calls, objects, verified };
}

test("off-service job uploads encrypted data, downloads/restores it and preserves tenant totals on recovery", async (t) => {
  const f = fixture(t);
  const expired = archiveKey("2026-08-01T02:00:00.000Z");
  f.objects.set(expired, Buffer.from("old"));
  f.verified.add(expired);
  const result = await runOffsiteBackup(f.config, { store: f.store, now });
  assert.deepEqual(result, { status: "ok", verifiedAt: now.toISOString(), deleted: 1 });
  assert.deepEqual(
    f.calls.map(([action]) => action),
    ["put", "get", "markVerified", "list", "remove"]
  );
  const state = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json")));
  assert.equal(f.objects.get(state.lastSuccess.object).includes(Buffer.from("مطعم أول")), false);
  assert.equal(state.lastSuccess.keyVersion, "v1");
  assert.deepEqual(checkOffsiteBackup(f.config.directory, { now }), { status: "ok", verifiedAt: now.toISOString() });
  assert.equal(fs.statSync(path.join(f.config.directory, "status.json")).mode & 0o777, 0o600);
  const restored = path.join(f.directory, "recovered.db");
  await fetchOffsiteBackup(f.config, {
    object: state.lastSuccess.object,
    destination: restored,
    expectedChecksum: state.lastSuccess.checksum,
    store: f.store
  });
  const database = new Database(restored, { readonly: true });
  try {
    assert.deepEqual(database.prepare("SELECT tenant,sum(amount) total FROM records GROUP BY tenant").all(), [
      { tenant: 1, total: 12050 },
      { tenant: 2, total: 9500 }
    ]);
  } finally {
    database.close();
  }
  assert.deepEqual(fs.readdirSync(f.config.directory), ["status.json"]);
});

test("failed upload preserves last verified point and never starts retention", async (t) => {
  const f = fixture(t);
  await runOffsiteBackup(f.config, { store: f.store, now });
  const previous = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json"))).lastSuccess;
  f.calls.length = 0;
  f.store.put = async () => {
    throw new Error(`credentials ${f.config.key}`);
  };
  await assert.rejects(runOffsiteBackup(f.config, { store: f.store, now }), /^Error: BACKUP_OPERATION_FAILED$/);
  assert.deepEqual(f.calls, []);
  const state = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json")));
  assert.deepEqual(state.lastSuccess, previous);
  assert.equal(state.lastAttempt.code, "BACKUP_OPERATION_FAILED");
  assert.equal(JSON.stringify(state).includes(f.config.key), false);
  assert.throws(() => checkOffsiteBackup(f.config.directory, { now }), /BACKUP_LAST_ATTEMPT_FAILED/);
});

test("last-success records completed restore verification rather than job start", async (t) => {
  const f = fixture(t);
  const completed = new Date(now.getTime() + 5 * 60 * 1000);
  const times = [now, completed];
  const result = await runOffsiteBackup(f.config, { store: f.store, clock: () => times.shift() });
  assert.equal(result.verifiedAt, completed.toISOString());
  const state = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json")));
  assert.equal(state.lastAttempt.at, now.toISOString());
  assert.equal(state.lastSuccess.verifiedAt, completed.toISOString());
});

test("corrupt remote download cannot replace success or trigger retention", async (t) => {
  const f = fixture(t);
  f.store.get = async (_key, file) => fs.writeFileSync(file, "corrupted remote object");
  await assert.rejects(runOffsiteBackup(f.config, { store: f.store, now }), /BACKUP_DOWNLOAD_MISMATCH/);
  assert.deepEqual(
    f.calls.map(([action]) => action),
    ["put"]
  );
  const state = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json")));
  assert.equal(state.lastSuccess, undefined);
  assert.equal(state.lastAttempt.code, "BACKUP_DOWNLOAD_MISMATCH");
  assert.deepEqual(fs.readdirSync(f.config.directory), ["status.json"]);
});

test("unverified newer upload cannot displace a verified historical recovery point", async (t) => {
  const f = fixture(t);
  const historical = new Date(now.getTime() - 10 * 86_400_000);
  await runOffsiteBackup(f.config, { store: f.store, now: historical });
  const verifiedKey = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json"))).lastSuccess.object;
  const get = f.store.get;
  f.store.get = async (_key, file) => fs.writeFileSync(file, "failed remote verification");
  await assert.rejects(
    runOffsiteBackup(f.config, { store: f.store, now: new Date(historical.getTime() + 60 * 60 * 1000) }),
    /BACKUP_DOWNLOAD_MISMATCH/
  );
  const unverified = [...f.objects.keys()].find((key) => key !== verifiedKey);
  assert.ok(unverified);
  assert.equal(f.verified.has(unverified), false);
  f.store.get = get;
  await runOffsiteBackup(f.config, { store: f.store, now });
  assert.equal(f.objects.has(verifiedKey), true);
  assert.ok((await f.store.list()).includes(verifiedKey));
  assert.equal((await f.store.list()).includes(unverified), false);
  assert.equal(
    f.calls.some(([action, key]) => action === "remove" && key === verifiedKey),
    false
  );
});

test("verified-tag failure fails job/monitor and never prunes recovery points", async (t) => {
  const f = fixture(t);
  await runOffsiteBackup(f.config, { store: f.store, now });
  const previous = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json"))).lastSuccess;
  f.calls.length = 0;
  f.store.markVerified = async () => {
    throw new Error("tag permission denied");
  };
  await assert.rejects(
    runOffsiteBackup(f.config, { store: f.store, now: new Date(now.getTime() + 60 * 60 * 1000) }),
    /BACKUP_OPERATION_FAILED/
  );
  assert.deepEqual(
    f.calls.map(([action]) => action),
    ["put", "get"]
  );
  const state = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json")));
  assert.deepEqual(state.lastSuccess, previous);
  assert.throws(() => checkOffsiteBackup(f.config.directory, { now }), /BACKUP_LAST_ATTEMPT_FAILED/);
});

test("retention failure remains visible while retaining newly verified recovery evidence", async (t) => {
  const f = fixture(t);
  f.objects.set(archiveKey("2026-08-01T02:00:00.000Z"), Buffer.from("old"));
  f.verified.add(archiveKey("2026-08-01T02:00:00.000Z"));
  f.store.remove = async () => {
    throw new Error("provider denied delete");
  };
  await assert.rejects(runOffsiteBackup(f.config, { store: f.store, now }), /BACKUP_OPERATION_FAILED/);
  const state = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json")));
  assert.ok(state.lastSuccess.object);
  assert.equal(state.lastAttempt.status, "failed");
  assert.throws(() => checkOffsiteBackup(f.config.directory, { now }), /BACKUP_LAST_ATTEMPT_FAILED/);
});

test("retention keeps seven daily/four weekly points, ignores unrelated/future objects and enforces 35 days", () => {
  const keys = [];
  for (let offset = 0; offset < 70; offset += 1) {
    keys.push(archiveKey(new Date(now.getTime() - offset * 86_400_000).toISOString()));
  }
  const unrelated = ["production/other-file", "another-environment/file", archiveKey("2026-10-20T02:00:00.000Z")];
  const removed = retentionCandidates([...keys, ...unrelated], "production", now);
  const retained = keys.filter((key) => !removed.includes(key));
  assert.equal(retained.length, 11);
  assert.deepEqual(retained.slice(0, 7), keys.slice(0, 7));
  assert.ok(keys.slice(36).every((key) => removed.includes(key)));
  assert.ok(unrelated.every((key) => !removed.includes(key)));
  const duplicate = archiveKey("2026-10-19T01:00:00.000Z");
  assert.ok(retentionCandidates([...keys, duplicate], "production", now).includes(duplicate));
});

test("exclusive lock rejects concurrent work and never removes another process lock", async (t) => {
  const f = fixture(t);
  let started;
  const signal = new Promise((resolve) => {
    started = resolve;
  });
  let resume;
  const gate = new Promise((resolve) => {
    resume = resolve;
  });
  const put = f.store.put;
  f.store.put = async (...args) => {
    started();
    await gate;
    return put(...args);
  };
  const first = runOffsiteBackup(f.config, { store: f.store, now });
  await signal;
  await assert.rejects(runOffsiteBackup(f.config, { store: f.store, now }), /BACKUP_ALREADY_RUNNING/);
  assert.equal(fs.existsSync(path.join(f.config.directory, "run.lock")), true);
  resume();
  await first;
  assert.equal(fs.existsSync(path.join(f.config.directory, "run.lock")), false);
});

test("monitor exits on missing/stale/future success and failed retention", async (t) => {
  const f = fixture(t);
  assert.throws(() => checkOffsiteBackup(f.config.directory, { now }), /BACKUP_STALE_OR_MISSING/);
  await runOffsiteBackup(f.config, { store: f.store, now });
  assert.throws(
    () => checkOffsiteBackup(f.config.directory, { now: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1) }),
    /BACKUP_STALE_OR_MISSING/
  );
  assert.throws(
    () => checkOffsiteBackup(f.config.directory, { now: new Date("2026-10-18") }),
    /BACKUP_STALE_OR_MISSING/
  );
});

test("recovery rejects wrong keys, corrupt downloads, out-of-prefix keys and existing destination", async (t) => {
  const f = fixture(t);
  await runOffsiteBackup(f.config, { store: f.store, now });
  const state = JSON.parse(fs.readFileSync(path.join(f.config.directory, "status.json"))).lastSuccess;
  const destination = path.join(f.directory, "recovered.db");
  const options = { object: state.object, destination, expectedChecksum: state.checksum, store: f.store };
  await assert.rejects(fetchOffsiteBackup({ ...f.config, key: randomBytes(32).toString("hex") }, options));
  assert.equal(fs.existsSync(destination), false);
  await assert.rejects(
    fetchOffsiteBackup(f.config, { ...options, object: "unrelated/private-object" }),
    /BACKUP_RECOVERY_INPUT_INVALID/
  );
  const existingDestination = path.join(f.directory, "existing.db");
  fs.writeFileSync(existingDestination, "KEEP", { flag: "wx", mode: 0o600 });
  await assert.rejects(
    fetchOffsiteBackup(f.config, { ...options, destination: existingDestination }),
    /BACKUP_TARGET_EXISTS/
  );
  assert.equal(fs.readFileSync(existingDestination, "utf8"), "KEEP");
  f.objects.set(state.object, Buffer.from("corrupted"));
  await assert.rejects(fetchOffsiteBackup(f.config, options), /BACKUP_DOWNLOAD_MISMATCH/);
  assert.equal(fs.existsSync(destination), false);
});

test("S3 adapter uses conditional private encrypted upload and redacts provider errors", async (t) => {
  const f = fixture(t);
  const calls = [];
  const verifiedKey = archiveKey(now.toISOString());
  const unverifiedKey = archiveKey("2026-10-18T02:00:00.000Z");
  const store = createS3ObjectStore(f.config, async (...args) => {
    calls.push(args);
    const command = args[1];
    if (command[0] === "s3api" && command[1] === "list-objects-v2") {
      return {
        stdout: JSON.stringify({
          Contents: [{ Key: verifiedKey }, { Key: unverifiedKey }, { Key: "production/unrelated" }]
        })
      };
    }
    if (command[1] === "get-object-tagging") {
      return {
        stdout: JSON.stringify({
          TagSet: command.includes(verifiedKey) ? [{ Key: "restrova-verified", Value: "true" }] : []
        })
      };
    }
    return { stdout: "{}" };
  });
  await store.put("production/a", "/private/archive.enc", "digest");
  const [executable, args, options] = calls[0];
  assert.equal(executable, "aws");
  assert.ok(args.includes("--if-none-match"));
  assert.ok(args.includes("--server-side-encryption"));
  assert.ok(args.includes("AES256"));
  assert.equal(args.includes("--acl"), false);
  assert.equal(args.includes("--no-verify-ssl"), false);
  assert.equal(options.env.RESTROVA_BACKUP_KEY, undefined);
  assert.equal(options.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, "true");
  await store.markVerified(verifiedKey);
  assert.ok(calls[1][1].includes("put-object-tagging"));
  assert.deepEqual(JSON.parse(calls[1][1][calls[1][1].indexOf("--tagging") + 1]), {
    TagSet: [{ Key: "restrova-verified", Value: "true" }]
  });
  assert.deepEqual(await store.list(), [verifiedKey]);
  const incomplete = createS3ObjectStore(f.config, async () => ({ stdout: '{"IsTruncated":true}' }));
  await assert.rejects(incomplete.list(), /BACKUP_OBJECT_LIST_INCOMPLETE/);
  const failed = createS3ObjectStore(f.config, async () => {
    throw new Error(f.config.key);
  });
  await assert.rejects(failed.list(), /^Error: BACKUP_OBJECT_STORE_FAILED$/);
});

test("configuration rejects unsafe prefix/private directory and CLI failures redact secrets", async (t) => {
  const f = fixture(t);
  assert.throws(() => readOffsiteBackupConfig({}), /BACKUP_CONFIG_INVALID/);
  await assert.rejects(
    runOffsiteBackup({ ...f.config, prefix: "../another" }, { store: f.store }),
    /BACKUP_CONFIG_INVALID/
  );
  fs.mkdirSync(f.config.directory, { mode: 0o755 });
  fs.chmodSync(f.config.directory, 0o755);
  await assert.rejects(runOffsiteBackup(f.config, { store: f.store }), /BACKUP_WORK_DIR_NOT_PRIVATE/);
  const result = spawnSync(process.execPath, ["scripts/offsite-backup.js", "run"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, RESTROVA_BACKUP_KEY: f.config.key, RESTROVA_BACKUP_S3_BUCKET: "INVALID/PRIVATE" }
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, "BACKUP_CONFIG_INVALID");
  assert.equal(result.stderr.includes(f.config.key), false);
  assert.equal(result.stderr.includes(f.directory), false);
});
