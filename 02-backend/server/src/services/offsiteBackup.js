import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDatabaseBackup, restoreDatabaseBackup } from "./databaseBackup.js";

const execute = promisify(execFile);
const day = 86_400_000;
const archivePattern = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([a-f0-9-]{36})\.restrova-backup$/;

export function backupFailureCode(error) {
  return /^BACKUP_[A-Z_]+$/.test(error?.message) ? error.message : "BACKUP_OPERATION_FAILED";
}

export function readOffsiteBackupConfig(environment = process.env) {
  const config = {
    source: environment.DATABASE_PATH,
    directory: environment.RESTROVA_BACKUP_WORK_DIR,
    bucket: environment.RESTROVA_BACKUP_S3_BUCKET,
    prefix: environment.RESTROVA_BACKUP_S3_PREFIX,
    region: environment.AWS_REGION,
    key: environment.RESTROVA_BACKUP_KEY,
    keyVersion: environment.RESTROVA_BACKUP_KEY_VERSION
  };
  validateConfig(config);
  return config;
}

function validateConfig(config) {
  if (
    !path.isAbsolute(config.source || "") ||
    !path.isAbsolute(config.directory || "") ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket || "") ||
    !/^[a-z0-9][a-z0-9/_-]{0,119}$/.test(config.prefix || "") ||
    config.prefix.split("/").some((part) => !part) ||
    !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(config.region || "") ||
    !/^[a-fA-F0-9]{64}$/.test(config.key || "") ||
    !/^[a-zA-Z0-9_-]{1,40}$/.test(config.keyVersion || "")
  ) {
    throw new Error("BACKUP_CONFIG_INVALID");
  }
}

// No shell, custom endpoint, debug output, key arguments or inherited AWS pager.
// Credentials come from the host's IAM role/standard AWS credential chain.
export function createS3ObjectStore(config, run = execute) {
  async function command(args) {
    try {
      const result = await run(
        "aws",
        ["s3api", ...args, "--region", config.region, "--no-cli-pager", "--output", "json"],
        {
          env: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(([name]) =>
                /^(AWS_|PATH$|HOME$|HTTPS?_PROXY$|https?_proxy$|NO_PROXY$|no_proxy$|SSL_CERT_FILE$|SSL_CERT_DIR$)/.test(
                  name
                )
              )
            ),
            AWS_PAGER: "",
            AWS_CLI_AUTO_PROMPT: "off",
            AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true"
          },
          timeout: 300_000,
          maxBuffer: 16 * 1024 * 1024
        }
      );
      return result.stdout.trim() ? JSON.parse(result.stdout) : {};
    } catch {
      // SDK/CLI errors can contain file paths, access IDs and request details.
      throw new Error("BACKUP_OBJECT_STORE_FAILED");
    }
  }
  return {
    put: (key, file, checksum) =>
      command([
        "put-object",
        "--bucket",
        config.bucket,
        "--key",
        key,
        "--body",
        file,
        "--if-none-match",
        "*",
        "--server-side-encryption",
        "AES256",
        "--checksum-algorithm",
        "SHA256",
        "--checksum-sha256",
        checksum,
        "--metadata",
        `restrova-key-version=${config.keyVersion}`
      ]),
    get: (key, file) => command(["get-object", "--bucket", config.bucket, "--key", key, file]),
    markVerified: (key) =>
      command([
        "put-object-tagging",
        "--bucket",
        config.bucket,
        "--key",
        key,
        "--tagging",
        JSON.stringify({ TagSet: [{ Key: "restrova-verified", Value: "true" }] })
      ]),
    list: async () => {
      const result = await command(["list-objects-v2", "--bucket", config.bucket, "--prefix", `${config.prefix}/`]);
      // AWS CLI auto-pagination is enabled; never prune a partial page.
      if (result.IsTruncated) throw new Error("BACKUP_OBJECT_LIST_INCOMPLETE");
      const verified = [];
      for (const { Key } of result.Contents || []) {
        if (archiveDate(Key, config.prefix) === null) continue;
        const tags = await command(["get-object-tagging", "--bucket", config.bucket, "--key", Key]);
        if (tags.TagSet?.some((tag) => tag.Key === "restrova-verified" && tag.Value === "true")) verified.push(Key);
      }
      return verified;
    },
    remove: (key) => command(["delete-object", "--bucket", config.bucket, "--key", key])
  };
}

async function checksum(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
}

function archiveDate(key, prefix) {
  const relative = key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : "";
  const match = archivePattern.exec(relative);
  if (!match) return null;
  const time = Date.parse(match[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z"));
  return Number.isFinite(time) ? time : null;
}

function weekStart(time) {
  const date = new Date(time);
  const utcDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return utcDate - ((date.getUTCDay() + 6) % 7) * day;
}

// Keep one latest recovery point per day for seven UTC days and one per earlier
// complete UTC week (up to four). Never retain anything older than 35 days.
export function retentionCandidates(keys, prefix, now) {
  const timestamp = new Date(now).getTime();
  const today = Math.floor(timestamp / day);
  const oldestDaily = (today - 6) * day;
  const archives = keys
    .map((key) => ({ key, time: archiveDate(key, prefix) }))
    .filter(({ time }) => time !== null && time <= timestamp)
    .sort((a, b) => b.time - a.time);
  const days = new Set();
  const weeks = new Set();
  const keep = new Set();
  for (const archive of archives) {
    if (timestamp - archive.time > 35 * day) continue;
    if (archive.time >= oldestDaily) {
      const date = Math.floor(archive.time / day);
      if (!days.has(date)) {
        days.add(date);
        keep.add(archive.key);
      }
    } else {
      const week = weekStart(archive.time);
      if (weeks.size < 4 && !weeks.has(week)) {
        weeks.add(week);
        keep.add(archive.key);
      }
    }
  }
  return archives.filter(({ key }) => !keep.has(key)).map(({ key }) => key);
}

function stateFile(directory) {
  return path.join(directory, "status.json");
}

function readState(directory) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(directory), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error("BACKUP_STATUS_INVALID");
  }
}

function saveState(directory, state) {
  const temporary = path.join(directory, `.status-${randomUUID()}.json`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(state) + "\n", { flag: "wx", mode: 0o600 });
    const descriptor = fs.openSync(temporary, "r");
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, stateFile(directory));
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function prepareDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error("BACKUP_WORK_DIR_NOT_PRIVATE");
  }
}

function acquireLock(directory) {
  const lock = path.join(directory, "run.lock");
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), {
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("BACKUP_ALREADY_RUNNING");
    throw error;
  }
  return () => fs.unlinkSync(lock);
}

export async function runOffsiteBackup(
  config,
  { store = createS3ObjectStore(config), now, clock = () => new Date() } = {}
) {
  validateConfig(config);
  prepareDirectory(config.directory);
  const release = acquireLock(config.directory);
  const timestamp = new Date(now ?? clock()).toISOString();
  const key = `${config.prefix}/${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}.restrova-backup`;
  let temporary;
  let state;
  try {
    state = readState(config.directory);
    temporary = fs.mkdtempSync(path.join(config.directory, ".run-"));
    const archive = path.join(temporary, "archive.enc");
    const downloaded = path.join(temporary, "download.enc");
    await createDatabaseBackup({ source: config.source, destination: archive, key: config.key });
    // Conditional single-object S3 uploads have a 5 GB ceiling. Fail locally
    // before sending anything; multipart support requires a separate design.
    if (fs.statSync(archive).size > 5_000_000_000) throw new Error("BACKUP_ARCHIVE_TOO_LARGE");
    const digest = await checksum(archive);
    await store.put(key, archive, digest);
    await store.get(key, downloaded);
    if ((await checksum(downloaded)) !== digest) throw new Error("BACKUP_DOWNLOAD_MISMATCH");
    await restoreDatabaseBackup({
      source: downloaded,
      destination: path.join(temporary, "verified.db"),
      key: config.key
    });
    // A failed/interrupted prior upload must never displace an authenticated
    // historical recovery point merely because its filename is newer.
    await store.markVerified(key);
    // Record success only after a real download, GCM authentication, SQLite integrity
    // and foreign-key validation. Retention can never run before that replacement.
    const verifiedAt = new Date(now ?? clock()).toISOString();
    state.lastSuccess = { verifiedAt, object: key, keyVersion: config.keyVersion, checksum: digest };
    state.lastAttempt = { at: timestamp, status: "verified" };
    saveState(config.directory, state);
    const verifiedKeys = await store.list();
    if (!verifiedKeys.includes(key)) throw new Error("BACKUP_VERIFIED_MARKER_MISSING");
    const candidates = retentionCandidates(verifiedKeys, config.prefix, verifiedAt);
    for (const oldKey of candidates) {
      if (oldKey !== key) await store.remove(oldKey);
    }
    state.lastAttempt = { at: timestamp, status: "ok", deleted: candidates.filter((entry) => entry !== key).length };
    saveState(config.directory, state);
    return { status: "ok", verifiedAt, deleted: state.lastAttempt.deleted };
  } catch (error) {
    const code = backupFailureCode(error);
    // Preserve the last successfully downloaded/restored recovery point even if
    // retention or the next upload fails. Never log provider errors or config.
    if (state) saveState(config.directory, { ...state, lastAttempt: { at: timestamp, status: "failed", code } });
    throw new Error(code);
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    release();
  }
}

export function checkOffsiteBackup(directory, { now = new Date(), maxAgeHours = 24 } = {}) {
  const state = readState(directory);
  const verified = Date.parse(state.lastSuccess?.verifiedAt);
  const age = new Date(now).getTime() - verified;
  if (!Number.isFinite(age) || age < 0 || age > maxAgeHours * 60 * 60 * 1000) {
    throw new Error("BACKUP_STALE_OR_MISSING");
  }
  if (state.lastAttempt?.status !== "ok") throw new Error("BACKUP_LAST_ATTEMPT_FAILED");
  return { status: "ok", verifiedAt: state.lastSuccess.verifiedAt };
}

// Recovery is deliberately separate from production startup and never replaces
// an existing database. GCM authenticates the archive; use its recorded checksum
// for independent object identity verification when recovering a chosen object.
export async function fetchOffsiteBackup(
  config,
  { object, destination, expectedChecksum, store = createS3ObjectStore(config) }
) {
  validateConfig(config);
  if (archiveDate(object, config.prefix) === null || !/^[A-Za-z0-9+/]{43}=$/.test(expectedChecksum || "")) {
    throw new Error("BACKUP_RECOVERY_INPUT_INVALID");
  }
  prepareDirectory(config.directory);
  const release = acquireLock(config.directory);
  let temporary;
  try {
    temporary = fs.mkdtempSync(path.join(config.directory, ".run-"));
    const downloaded = path.join(temporary, "download.enc");
    await store.get(object, downloaded);
    if ((await checksum(downloaded)) !== expectedChecksum) throw new Error("BACKUP_DOWNLOAD_MISMATCH");
    return await restoreDatabaseBackup({ source: downloaded, destination, key: config.key });
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    release();
  }
}
