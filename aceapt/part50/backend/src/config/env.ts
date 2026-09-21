import 'dotenv/config';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

export const env = {
  port: Number(process.env.PORT ?? 4050),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  databaseUrl: process.env.DATABASE_URL ?? '',

  jwtSecret: process.env.JWT_SECRET ?? '',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  aiCoachingModel: process.env.AI_COACHING_MODEL ?? 'claude-haiku-4-5-20251001',
  enableAiCoaching: bool(process.env.ENABLE_AI_COACHING, false),
};

export const hasDatabase = env.databaseUrl.trim().length > 0;
export const hasJwtSecret = env.jwtSecret.trim().length > 0;
export const hasAiCoaching = env.enableAiCoaching && env.anthropicApiKey.trim().length > 0;
