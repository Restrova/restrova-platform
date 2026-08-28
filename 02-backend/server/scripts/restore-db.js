#!/usr/bin/env node
// Database restore CLI (Phase 4).
//
// Usage:
//   node scripts/restore-db.js <backup-file.db> --to /var/data/restaurant.db [--force]
//
// Steps: verify the backup (checksum + integrity_check), copy it to the
// destination, then verify the restored file. STOP THE SERVER FIRST when
// restoring over the live database path. --force is required to overwrite an
// existing database file.
import path from "node:path";
import url from "node:url";
import "dotenv/config";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const { restoreBackup } = await import(`${root}/src/backup.js`);

function parseArg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

const backupPath = process.argv.find((arg) => !arg.startsWith("--") && arg.endsWith(".db"));
const destinationPath = parseArg("--to") || process.env.DATABASE_PATH;
const force = process.argv.includes("--force");

if (!backupPath) {
  console.error("Usage: node scripts/restore-db.js <backup-file.db> --to <destination.db> [--force]");
  process.exit(1);
}
if (!destinationPath) {
  console.error("Restore error: no destination. Pass --to <path> or set DATABASE_PATH.");
  process.exit(1);
}
if (backupPath === destinationPath) {
  console.error("Restore error: source and destination are the same file.");
  process.exit(1);
}

try {
  const result = restoreBackup({ backupPath, destinationPath, force });
  console.log(`Restored: ${result.source} -> ${result.restoredTo}`);
  console.log(`  integrity_check: ${result.verification.integrityCheck}`);
  const counts = result.verification.rowCounts;
  console.log("  row counts:");
  for (const [table, count] of Object.entries(counts)) console.log(`    ${table}: ${count}`);
  console.log("Next: restart the backend, then verify /api/health, login and the dashboard.");
} catch (error) {
  console.error(`Restore failed: ${error.message}`);
  process.exit(1);
}
