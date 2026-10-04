import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "restrova-browser-"));
process.env.NODE_ENV = "test";
process.env.PORT = "4000";
process.env.CLIENT_ORIGIN = "http://127.0.0.1:5173";
process.env.DATABASE_PATH = join(directory, "review.db");
const { app } = await import("../02-backend/server/src/index.js");
const { db } = await import("../02-backend/server/src/db.js");
const server = app.listen(4000);
function stop() {
  server.close(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
