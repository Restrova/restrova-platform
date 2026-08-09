import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config/appConfig.js";
import { configureSecurity } from "./middleware/security.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRoutes } from "./routes/apiRoutes.js";
import { requestLogger } from "./observability/logger.js";

export function createApp() {
  const app = express();
  configureSecurity(app);
  app.use(requestLogger);
  app.use("/api", apiRoutes);

  if (config.isProduction) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const webDist = path.resolve(currentDir, "../../../03-frontend/web/dist");
    app.use(express.static(webDist));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      return res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
