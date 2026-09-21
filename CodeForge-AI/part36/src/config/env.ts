import 'dotenv/config';
import { z } from 'zod';

const boolFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_PROVIDER: z.enum(['memory', 'postgres']).default('memory'),
  DATABASE_URL: z.string().optional(),

  CACHE_PROVIDER: z.enum(['memory', 'redis']).default('memory'),
  QUEUE_PROVIDER: z.enum(['memory', 'bullmq']).default('memory'),
  REDIS_URL: z.string().optional().default(''),

  JWT_SECRET: z.string().optional().default(''),
  JWT_ISSUER: z.string().default('codeforge'),

  AI_PROVIDER: z.enum(['none', 'anthropic']).default('none'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default(''),

  PRIVACY_MIN_COHORT_SIZE: z.coerce.number().int().nonnegative().default(10),
  PRIVACY_MIN_COVERAGE_FOR_CLAIM: z.coerce.number().min(0).max(1).default(0.3),

  USE_MOCK_INTEGRATIONS: boolFromString('true'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. Check .env against .env.example.');
}

export const env = parsed.data;

/** Section 52/65: fail loudly at boot rather than silently running
 * insecurely in production. Memory-mode dev/test is exempt on
 * purpose — that's the zero-config path. */
export function assertProductionSecrets(): void {
  if (env.NODE_ENV !== 'production') return;

  if (!env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production.');
  if (env.DATABASE_PROVIDER === 'postgres' && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set when DATABASE_PROVIDER=postgres.');
  }
  if (env.CACHE_PROVIDER === 'redis' && !env.REDIS_URL) {
    throw new Error('REDIS_URL must be set when CACHE_PROVIDER=redis.');
  }
  if (env.QUEUE_PROVIDER === 'bullmq' && !env.REDIS_URL) {
    throw new Error('REDIS_URL must be set when QUEUE_PROVIDER=bullmq.');
  }
  if (env.AI_PROVIDER === 'anthropic' && !env.AI_API_KEY) {
    throw new Error('AI_API_KEY must be set when AI_PROVIDER=anthropic.');
  }
}
