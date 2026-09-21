import "dotenv/config";
import { z } from "zod";
import crypto from "node:crypto";

/**
 * CONFIGURATION SECURITY
 * -----------------------------------------------------------------------
 * Validated once at process startup. If a security-critical value is
 * missing in a real environment, we refuse to boot rather than start in a
 * silently-insecure state (FAIL-CLOSED SECURITY). The one exception is
 * NODE_ENV=test, where the test harness injects ephemeral, random secrets
 * that are never used outside the test process — this keeps `npm test`
 * runnable without a human filling in .env first, without weakening
 * production behavior.
 */

const isTest = process.env.NODE_ENV === "test";

function ephemeralTestSecret(label: string): string {
  // Deterministic-enough per process, never persisted, never used outside tests.
  return `test-${label}-${crypto.randomBytes(16).toString("hex")}`;
}

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4040),
  SERVICE_NAME: z.string().min(1).default("codeforge-feature40"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_ADMIN_URL: z.string().optional(),

  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),

  RECENT_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  ALERT_EMAIL_FROM: z.string().optional(),
  ALERT_EMAIL_PROVIDER_API_KEY: z.string().optional(),

  AI_GATEWAY_INTERNAL_URL: z.string().optional(),

  RATE_LIMIT_LOGIN_MAX_PER_15M: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_DEFAULT_MAX_PER_MIN: z.coerce.number().int().positive().default(120),

  // Comma-separated exact origins, e.g. "https://app.codeforge.example,https://admin.codeforge.example".
  // CORS SECURITY: intentionally has NO wildcard default. In production,
  // an empty value means "no browser origin is allowed" rather than
  // silently falling back to "*" — see lib/cors.ts.
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(730),
  SECURITY_EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(365)
});

function loadEnv() {
  const source = { ...process.env };

  if (isTest) {
    // Provide safe, ephemeral fallbacks so the suite is runnable without a
    // filled-in .env. Real deployments must set these for real.
    source.DATABASE_URL ||= process.env.TEST_DATABASE_URL;
    source.SUPABASE_JWT_SECRET ||= ephemeralTestSecret("supabase-jwt");
  }

  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    // Fail closed: do not start the process in an under-configured state.
    throw new Error(
      `[env] Refusing to start — invalid/missing configuration:\n${issues}\n` +
        `See .env.example. Nothing in that file is a real secret; you must supply your own.`
    );
  }

  const env = parsed.data;

  // Identity verification needs exactly one signing strategy configured
  // (shared-secret HS256 or JWKS/RS256), never neither, never silently both.
  if (!isTest && !env.SUPABASE_JWT_SECRET && !env.SUPABASE_JWKS_URL) {
    throw new Error(
      "[env] Refusing to start — neither SUPABASE_JWT_SECRET nor SUPABASE_JWKS_URL is set. " +
        "Identity middleware has no way to verify tokens, and failing open is not acceptable."
    );
  }

  return env;
}

export const env = loadEnv();
export type Env = typeof env;
export const isProduction = env.NODE_ENV === "production";
