import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ownsDatabase = !process.env.DATABASE_PATH;
const temporaryDirectory = ownsDatabase ? fs.mkdtempSync(path.join(os.tmpdir(), "restrova-server-tests-")) : null;
const databasePath = process.env.DATABASE_PATH || path.join(temporaryDirectory, "restaurant.db");

try {
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_PATH: databasePath,
      // Tests rely on the seeded demo restaurant fixture.
      ENABLE_DEMO_SEED: "true"
    },
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
