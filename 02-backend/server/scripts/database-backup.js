import { createDatabaseBackup, restoreDatabaseBackup } from "../src/services/databaseBackup.js";

const [action, source, destination, ...extra] = process.argv.slice(2);
if (!["create", "restore"].includes(action) || !source || !destination || extra.length) {
  console.error("Usage: node scripts/database-backup.js <create|restore> <source> <new-destination>");
  process.exitCode = 1;
} else {
  try {
    const operation = action === "create" ? createDatabaseBackup : restoreDatabaseBackup;
    const result = await operation({ source, destination, key: process.env.RESTROVA_BACKUP_KEY });
    console.log(JSON.stringify({ event: "database_backup", action, ...result }));
  } catch (error) {
    // Never print SQL, file contents, keys or potentially sensitive OS error text.
    const code = /^BACKUP_[A-Z_]+$/.test(error.message) ? error.message : "BACKUP_OPERATION_FAILED";
    console.error(JSON.stringify({ event: "database_backup", action, status: "failed", code }));
    process.exitCode = 1;
  }
}
