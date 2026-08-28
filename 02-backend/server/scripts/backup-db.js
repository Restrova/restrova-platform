#!/usr/bin/env node
// Manual database backup CLI (Phase 4).
//
// Usage:
//   DATABASE_PATH=/var/data/restaurant.db node scripts/backup-db.js [--out DIR]
//
// Creates a consistent WAL-safe snapshot plus a .sha256 sidecar, then applies
// the retention policy (BACKUP_RETENTION_COUNT, default 7). Safe while the
// server is running.
import path from "node:path";
import url from "node:url";
import "dotenv/config";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const { createBackup, pruneBackups, verifyBackup } = await import(`${root}/src/backup.js`);

function parseArg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

try {
  const outputDir = parseArg("--out");
  const metadata = createBackup(outputDir ? { outputDir } : {});
  const verification = verifyBackup(metadata.path);
  console.log(`Backup created: ${metadata.path}`);
  console.log(`  size: ${metadata.sizeBytes} bytes`);
  console.log(`  sha256: ${metadata.sha256}`);
  console.log(`  integrity_check: ${verification.integrityCheck}`);
  const pruned = pruneBackups(outputDir || undefined);
  if (pruned.removed.length > 0) console.log(`  retention: removed ${pruned.removed.length} old backup(s)`);
} catch (error) {
  console.error(`Backup failed: ${error.message}`);
  process.exit(1);
}
