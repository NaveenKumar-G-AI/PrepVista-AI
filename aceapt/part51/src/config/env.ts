import "dotenv/config";

function required(name: string, fallbackForTests?: string): string {
  const v = process.env[name] ?? fallbackForTests;
  if (v === undefined || v === "") {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

export const env = {
  port: Number(process.env.PORT ?? 4051),
  nodeEnv: process.env.NODE_ENV ?? "development",

  pg: {
    host: required("PGHOST"),
    port: Number(process.env.PGPORT ?? 5432),
    database: required("PGDATABASE"),
    owner: { user: required("OWNER_PGUSER"), password: required("OWNER_PGPASSWORD") },
    app: { user: required("APP_PGUSER"), password: required("APP_PGPASSWORD") },
    service: { user: required("SERVICE_PGUSER"), password: required("SERVICE_PGPASSWORD") }
  },

  authSharedSecret: optional("AUTH_SHARED_SECRET")
};

/**
 * Read dynamically (not cached on the `env` object above) so the AI path can
 * be toggled at runtime without a process restart — and so tests can flip
 * ANTHROPIC_API_KEY between cases without re-importing this module.
 */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicConfig(): { apiKey: string; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return { apiKey, model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6" };
}
