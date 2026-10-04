import express from "express";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config/appConfig.js";
import { configureSecurity } from "./middleware/security.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRoutes } from "./routes/apiRoutes.js";
import { rateLimited } from "./errors/appError.js";
import { requestLogger } from "./observability/logger.js";

export function createApp() {
  const app = express();
  configureSecurity(app);
  // Bound all ingress, including static files, before any expensive handlers.
  // The existing API/auth/import limiters retain their tighter, bounded client buckets.
  app.use(
    rateLimit({
      windowMs: config.rateLimits.windowMs,
      limit: config.rateLimits.apiMax * 2,
      standardHeaders: false,
      legacyHeaders: false,
      handler(_req, _res, next) {
        next(rateLimited("Too many requests. Please try again later."));
      }
    })
  );
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
