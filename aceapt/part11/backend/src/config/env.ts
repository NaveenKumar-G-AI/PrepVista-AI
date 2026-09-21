import 'dotenv/config';

/**
 * Centralized environment access. Nothing else in the codebase should read
 * process.env directly - see .env.example for the full list of variables,
 * which fields are intentionally left blank, and why.
 */
export const ENV = {
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? '',
  DEMO_MODE: (process.env.DEMO_MODE ?? 'true').toLowerCase() === 'true',
};
