import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";

function warnOnce(message: string) {
  // eslint-disable-next-line no-console
  console.warn(`[config] ${message}`);
}

const jwtSecretFromEnv = process.env.JWT_SECRET?.trim();
if (!jwtSecretFromEnv) {
  warnOnce(
    "JWT_SECRET is blank — using a random ephemeral secret for this process only. " +
      "Tokens will stop working on restart. Set JWT_SECRET in backend/.env before deploying."
  );
}

const anthropicKeyFromEnv = process.env.ANTHROPIC_API_KEY?.trim();
if (!anthropicKeyFromEnv) {
  warnOnce(
    "ANTHROPIC_API_KEY is blank — AI-assisted question generation is disabled. " +
      "The template-based generator still runs the full pipeline; add a key in backend/.env to enable it."
  );
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  dbPath: path.resolve(__dirname, "..", process.env.DB_PATH ?? "./data/aceapt.db"),
  jwtSecret: jwtSecretFromEnv || crypto.randomBytes(32).toString("hex"),
  anthropicApiKey: anthropicKeyFromEnv || null,
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
};
