import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function migrate(db, options = {}) {
  const migrationsDir = options.migrationsDir ?? path.join(__dirname, "migrations");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");

  const record = db.prepare("INSERT INTO schema_migrations(version) VALUES (?)");

  for (const file of files) {
    if (applied.get(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      record.run(file);
    });

    applyMigration();
  }
}
