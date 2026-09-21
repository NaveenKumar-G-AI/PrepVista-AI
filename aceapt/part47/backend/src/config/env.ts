import 'dotenv/config';

/**
 * Centralized, typed access to environment configuration.
 *
 * Design rule: a BLANK secret must never crash the process. Feature 47 is
 * required to run on deterministic fallbacks when AI is unavailable
 * (spec Section 66 / 109), and it must be possible to boot this service
 * with zero external credentials configured (per the "leave keys blank for
 * now" instruction this module was built under).
 */

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function readInt(value: string | undefined, fallback: number): number {
  const n = value === undefined || value === '' ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: readInt(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // AI - intentionally allowed to be blank. See src/domain/ai/aiClient.ts.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
  anthropicTimeoutMs: readInt(process.env.ANTHROPIC_TIMEOUT_MS, 4000),

  // Auth stub - see src/api/middleware/auth.ts. Falls back to an obviously
  // dev-only value rather than throwing, but logs a loud warning so nobody
  // ships this by accident.
  authStubSecret: process.env.AUTH_STUB_SECRET || 'DEV-ONLY-INSECURE-DEFAULT',
  authStubSecretIsDefault: !process.env.AUTH_STUB_SECRET,

  dataDir: process.env.DATA_DIR || './.data',

  enableDevRoutes: readBool(process.env.ENABLE_DEV_ROUTES, process.env.NODE_ENV !== 'production'),
};

export function warnOnInsecureDefaults(logger: Pick<Console, 'warn'> = console): void {
  if (env.authStubSecretIsDefault) {
    logger.warn(
      '[config] AUTH_STUB_SECRET is not set - using an insecure development default. ' +
        'This is fine for local/demo use, but must never run like this in a shared or ' +
        'production environment. This whole auth module is a stub for standalone use ' +
        'anyway (see src/api/middleware/auth.ts) and should be replaced by ACEAPT\'s ' +
        'real authentication before integration.',
    );
  }
  if (!env.anthropicApiKey) {
    logger.warn(
      '[config] ANTHROPIC_API_KEY is not set - Guided Solving will run entirely on ' +
        'deterministic fallback guidance (hint ladders + templates from the problem ' +
        'bank). This is expected until you add a key; nothing is broken.',
    );
  }
}
