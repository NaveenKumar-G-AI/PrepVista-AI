import "dotenv/config";
import type { HelpLevel } from "../domain/types";

function toInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: toInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || "development",

  authMode: (process.env.AUTH_MODE === "jwt" ? "jwt" : "dev") as "dev" | "jwt",
  jwtSecret: process.env.JWT_SECRET || "",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",

  dataDir: process.env.DATA_DIR || "./data",

  maxHintLevel: Math.min(6, Math.max(0, toInt(process.env.MAX_HINT_LEVEL, 6))) as HelpLevel,
  maxTurnsPerState: toInt(process.env.MAX_TURNS_PER_STATE, 4),
  maxLoopBacks: toInt(process.env.MAX_LOOP_BACKS, 2),
};

if (env.authMode === "jwt" && !env.jwtSecret) {
  throw new Error(
    "AUTH_MODE=jwt requires JWT_SECRET to be set in .env (or switch AUTH_MODE back to 'dev' for local testing)."
  );
}
