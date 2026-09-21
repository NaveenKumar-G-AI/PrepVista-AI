import 'dotenv/config';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Centralized configuration. Nothing in this codebase should read
 * process.env directly outside this file — that's how pricing/limits end
 * up hardcoded in business logic, which Feature 39 explicitly exists to
 * avoid.
 */
export const config = {
  port: int('PORT', 4039),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtIssuer: process.env.JWT_ISSUER ?? '',
  },

  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? '',

  providers: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  },

  /**
   * SAFE DEFAULTS — applied only when no explicit policy/budget has been
   * configured for a given scope. Per the "never default to unlimited AI
   * usage" requirement, there is intentionally no "unlimited" option here.
   */
  safeDefaults: {
    dailyBudgetUsd: int('DEFAULT_DAILY_BUDGET_USD', 50),
    requestTimeoutMs: int('DEFAULT_REQUEST_TIMEOUT_MS', 30_000),
    maxRetries: int('DEFAULT_MAX_RETRIES', 2),
    maxConcurrentPerProvider: int('DEFAULT_MAX_CONCURRENT_PER_PROVIDER', 20),
    rateLimitPerMinute: int('DEFAULT_RATE_LIMIT_PER_MINUTE', 60),
    maxContextTokens: int('DEFAULT_MAX_CONTEXT_TOKENS', 100_000),
    circuitBreakerFailureThreshold: int('DEFAULT_CIRCUIT_FAILURE_THRESHOLD', 5),
    circuitBreakerWindowMs: int('DEFAULT_CIRCUIT_WINDOW_MS', 60_000),
    circuitBreakerCooldownMs: int('DEFAULT_CIRCUIT_COOLDOWN_MS', 30_000),
  },

  emergency: {
    passphrase: process.env.EMERGENCY_CONTROL_PASSPHRASE ?? '',
  },
} as const;

export const usingInMemoryPersistence = config.databaseUrl.trim().length === 0;
export const usingInMemoryCacheAndLimiters = config.redisUrl.trim().length === 0;
