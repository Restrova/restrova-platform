import "dotenv/config";
import { createApp } from "./app.js";
import { config } from "./config/appConfig.js";
import { getAiRuntimeStatus } from "./ai.js";
import { getAuthContext } from "./repositories/authRepository.js";
import { serializeMe } from "./services/authService.js";
import { startBackupScheduler } from "./backup.js";
import { logInfo, logWarn } from "./observability/logger.js";

const app = createApp();

if (!config.isTest) {
  app.listen(config.port, () => {
    const ai = getAiRuntimeStatus();
    console.log(`API listening on http://localhost:${config.port}`);
    logInfo("ai_mode_active", { mode: ai.mode, model: ai.model });
    if (config.isProduction && ai.mode !== "openai") {
      // Production readiness (Phase 4): the deterministic demo assistant must
      // never silently pass for the full LLM experience in a real deployment.
      logWarn(
        "ai_demo_mode_in_production",
        "OPENAI_API_KEY is not set: the assistant runs in deterministic demo mode. Set OPENAI_API_KEY to enable real LLM answers."
      );
    }
    startBackupScheduler();
  });
}

export { app, getAuthContext, serializeMe };
