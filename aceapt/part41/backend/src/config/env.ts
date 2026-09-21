import 'dotenv/config';

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v == null || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl: process.env.DATABASE_URL || '',
  useInMemoryStore: (process.env.FEATURE41_STORE || 'memory') !== 'postgres',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  llmModel: process.env.FEATURE41_LLM_MODEL || 'claude-sonnet-5',
  llmEnabled: !!process.env.ANTHROPIC_API_KEY,

  jwtSecret: process.env.JWT_SECRET || '',

  rateLimitPerMinute: parseInt(process.env.FEATURE41_RATE_LIMIT_PER_MIN || '60', 10),
  verboseLogging: bool(process.env.FEATURE41_VERBOSE_LOG, false),
};
