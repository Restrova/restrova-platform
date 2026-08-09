import { db } from "../db.js";
import { getAiRuntimeStatus } from "../ai.js";

export function getHealth() {
  const ai = getAiRuntimeStatus();
  return { status: "ok", ai: ai.mode, version: "prefinal", ...ai };
}

export function getReadiness() {
  db.prepare("SELECT 1 AS ok").get();
  const ai = getAiRuntimeStatus();
  return {
    status: "ready",
    checks: {
      database: "ok",
      ai: ai.mode
    },
    version: "prefinal"
  };
}
