import 'dotenv/config';

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

/**
 * Central config. Every secret defaults to an empty string on purpose -
 * per the build instructions, keys are left blank here for you to fill in
 * (copy .env.example to .env). Nothing in this file should ever hold a
 * real credential; it only reads them from the environment.
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 4000),
  DATABASE_PATH: process.env.DATABASE_PATH || './data/shortcuts.db',

  // --- Secrets - intentionally blank until you fill in .env ---
  JWT_SECRET: process.env.JWT_SECRET || '',
  ALLOW_DEV_AUTH: bool(process.env.ALLOW_DEV_AUTH, true),

  AI_PROVIDER: process.env.AI_PROVIDER || 'anthropic',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'claude-sonnet-4-6',

  DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID || 'dev-tenant',

  // --- Integration endpoints for other ACEAPT features - blank placeholders,
  // wire these to real services when they exist. See src/integrations/*.ts ---
  FORMULA_SERVICE_URL: process.env.FORMULA_SERVICE_URL || '',
  SKILL_SERVICE_URL: process.env.SKILL_SERVICE_URL || '',
  QUESTION_FAMILY_SERVICE_URL: process.env.QUESTION_FAMILY_SERVICE_URL || '',
  DIFFICULTY_SERVICE_URL: process.env.DIFFICULTY_SERVICE_URL || '',
  NOVELTY_SERVICE_URL: process.env.NOVELTY_SERVICE_URL || '',
  MISTAKE_INTELLIGENCE_SERVICE_URL: process.env.MISTAKE_INTELLIGENCE_SERVICE_URL || '',
};

export type Env = typeof env;

if (env.NODE_ENV === 'production' && !env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] JWT_SECRET is blank. The dev-auth header fallback is disabled in production, ' +
      'so every request will be rejected until you set a real secret in .env.'
  );
}
