import 'dotenv/config';
import path from 'node:path';

/**
 * Every value has a safe local-dev fallback so the server runs with zero
 * configuration. Real deployments should set these via a real .env (copy
 * .env.example) or the hosting platform's secret manager - never commit
 * actual secrets.
 */
export const env = {
  port: Number(process.env.PORT) || 4000,
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'aceapt.sqlite'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};

export const isProduction = env.nodeEnv === 'production';
