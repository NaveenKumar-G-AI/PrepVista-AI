import 'dotenv/config';
import { z } from 'zod';

const adapterMode = z.enum(['stub', 'live']).default('stub');

const EnvSchema = z.object({
  DATABASE_URL: z.string().default('file:./dev.db'),
  PORT: z.coerce.number().int().positive().default(4045),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  AUTH_JWT_SECRET: z.string().optional().default(''),

  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),

  MASTERY_ADAPTER_MODE: adapterMode,
  MISTAKE_ADAPTER_MODE: adapterMode,
  RETENTION_ADAPTER_MODE: adapterMode,
  GOAL_ADAPTER_MODE: adapterMode,
  ROSTER_ADAPTER_MODE: adapterMode,
});

export const env = EnvSchema.parse(process.env);

export const isAiSuggestionAvailable = () => env.ANTHROPIC_API_KEY.trim().length > 0;
