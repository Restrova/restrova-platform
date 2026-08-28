import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { config } from "./config/appConfig.js";
import { logInfo } from "./observability/logger.js";

// Minimal SQLite backup/restore toolkit (Phase 4 production readiness).
//
// Backups use `VACUUM INTO`: one statement that writes a consistent,
// checkpointed, standalone snapshot while the server keeps serving traffic
// (WAL-safe). Each backup gets a .sha256 sidecar so restores can be verified.
//
// Kept deliberately simple: no new service, no external tools, no deps.

const BACKUP_FILE_PREFIX = "restaurant-backup-";

// Tables whose row counts are reported for backup/restore verification.
const CORE_TABLES = [
  "owners",
  "organizations",
  "restaurants",
  "branches",
  "organization_users",
  "orders",
  "menu_items",
  "chat_sessions",
  "chat_messages",
  "financial_ledger_entries"
];

function defaultBackupDir() {
  if (config.backup.outputDir) return config.backup.outputDir;
  if (!config.databasePath) return null;
  return path.join(path.dirname(path.resolve(config.databasePath)), "backups");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function coreRowCounts(db) {
  const counts = {};
  for (const table of CORE_TABLES) {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    counts[table] = exists ? db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n : 0;
  }
  return counts;
}

function backupTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Create one consistent backup of the configured database.
 * Synchronous and safe to run while the server is writing (WAL snapshot).
 */
export function createBackup({ databasePath = config.databasePath, outputDir = defaultBackupDir() } = {}) {
  if (!databasePath) throw new Error("Backup error: DATABASE_PATH is not configured.");
  if (!fs.existsSync(databasePath)) throw new Error(`Backup error: database file not found at ${databasePath}.`);
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = `${BACKUP_FILE_PREFIX}${backupTimestamp()}.db`;
  let targetPath = path.join(outputDir, fileName);
  // VACUUM INTO refuses to overwrite; add a numeric suffix on same-second
  // collisions (e.g. manual CLI run racing the scheduler).
  let suffix = 0;
  while (fs.existsSync(targetPath)) {
    suffix += 1;
    targetPath = path.join(outputDir, `${BACKUP_FILE_PREFIX}${backupTimestamp()}-${suffix}.db`);
  }

  const source = new Database(databasePath, { readonly: true });
  try {
    source.prepare("VACUUM INTO ?").run(targetPath);
  } finally {
    source.close();
  }

  const checksum = sha256File(targetPath);
  fs.writeFileSync(`${targetPath}.sha256`, `${checksum}  ${path.basename(targetPath)}\n`, "utf8");

  const metadata = {
    path: targetPath,
    fileName: path.basename(targetPath),
    sizeBytes: fs.statSync(targetPath).size,
    sha256: checksum,
    createdAt: new Date().toISOString()
  };
  logInfo("database_backup_created", {
    file: metadata.fileName,
    sizeBytes: metadata.sizeBytes,
    sha256: metadata.sha256
  });
  return metadata;
}

/**
 * Verify a backup file: checksum (when a sidecar exists), SQLite integrity
 * check and core table row counts. Throws on any problem.
 */
export function verifyBackup(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Verify error: file not found at ${filePath}.`);
  const sidecar = `${filePath}.sha256`;
  let checksumOk = null;
  if (fs.existsSync(sidecar)) {
    const expected = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
    checksumOk = sha256File(filePath) === expected;
    if (!checksumOk) throw new Error(`Verify error: checksum mismatch for ${filePath}.`);
  }
  const db = new Database(filePath, { readonly: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Verify error: integrity_check failed for ${filePath}: ${integrity}`);
    return { file: filePath, integrityCheck: "ok", checksumOk, rowCounts: coreRowCounts(db) };
  } finally {
    db.close();
  }
}

/**
 * Restore a verified backup file to a destination path.
 * Refuses to overwrite an existing database unless `force` is true.
 * Stop the server before restoring over a live database file.
 */
export function restoreBackup({ backupPath, destinationPath, force = false }) {
  if (!fs.existsSync(backupPath)) throw new Error(`Restore error: backup not found at ${backupPath}.`);
  verifyBackup(backupPath);
  if (fs.existsSync(destinationPath) && !force) {
    throw new Error(
      `Restore error: ${destinationPath} already exists. Stop the server and pass --force to replace it.`
    );
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(backupPath, destinationPath);
  // Remove stale SQLite sidecar files from a previous database at this path.
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${destinationPath}${suffix}`;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
  const result = { restoredTo: destinationPath, source: backupPath, verification: verifyBackup(destinationPath) };
  logInfo("database_backup_restored", { from: backupPath, to: destinationPath });
  return result;
}

/** Keep only the newest `keepCount` backups in a directory. */
export function pruneBackups(outputDir = defaultBackupDir(), keepCount = config.backup.retentionCount) {
  if (!fs.existsSync(outputDir)) return { removed: [] };
  const backups = fs
    .readdirSync(outputDir)
    .filter((name) => name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(".db"))
    .sort(); // timestamped names sort chronologically
  const toRemove = backups.slice(0, Math.max(0, backups.length - keepCount));
  for (const name of toRemove) {
    fs.unlinkSync(path.join(outputDir, name));
    const sidecar = path.join(outputDir, `${name}.sha256`);
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
  if (toRemove.length > 0) logInfo("database_backups_pruned", { removed: toRemove.length, kept: keepCount });
  return { removed: toRemove };
}

/**
 * Optional in-process backup scheduler. Disabled unless BACKUP_ENABLED=true.
 * One unref'd interval so CLI/test processes exit cleanly.
 */
export function startBackupScheduler() {
  if (!config.backup.enabled) return null;
  const intervalMs = config.backup.intervalHours * 60 * 60 * 1000;
  const runBackup = () => {
    try {
      createBackup();
      pruneBackups();
    } catch (error) {
      console.warn(`Backup scheduler: ${error?.message || error}`);
    }
  };
  const timer = setInterval(runBackup, intervalMs);
  timer.unref?.();
  logInfo("database_backup_scheduler_started", {
    intervalHours: config.backup.intervalHours,
    retentionCount: config.backup.retentionCount,
    outputDir: defaultBackupDir()
  });
  return { stop: () => clearInterval(timer), runNow: runBackup };
}
