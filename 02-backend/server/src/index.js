import "dotenv/config";
import { createApp } from "./app.js";
import { config } from "./config/appConfig.js";
import { getAiRuntimeStatus } from "./ai.js";
import { getAuthContext } from "./repositories/authRepository.js";
import { serializeMe } from "./services/authService.js";
import { logInfo } from "./observability/logger.js";

const app = createApp();

if (!config.isTest) {
  app.listen(config.port, () => {
    const ai = getAiRuntimeStatus();
    console.log(`API listening on http://localhost:${config.port}`);
    logInfo("ai_mode_active", { mode: ai.mode, model: ai.model });
  });
}

export { app, getAuthContext, serializeMe };
