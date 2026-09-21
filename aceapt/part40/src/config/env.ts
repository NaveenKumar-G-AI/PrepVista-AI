import * as dotenv from 'dotenv';
dotenv.config();

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  port: Number(optional('PORT', '4040')),
  nodeEnv: optional('NODE_ENV', 'development'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  db: {
    host: optional('PGHOST', '127.0.0.1'),
    port: Number(optional('PGPORT', '5432')),
    database: optional('PGDATABASE', 'aceapt_feature40'),
    user: optional('PGUSER', 'aceapt_app'),
    password: optional('PGPASSWORD', ''),
  },

  worker: {
    user: optional('WORKER_PGUSER', 'aceapt_worker'),
    password: optional('WORKER_PGPASSWORD', ''),
  },

  ai: {
    apiKey: optional('ANTHROPIC_API_KEY', ''),
    model: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
    get enabled() {
      return this.apiKey.length > 0;
    },
  },

  feature36: {
    url: optional('FEATURE36_ACTION_ENGINE_URL', ''),
    apiKey: optional('FEATURE36_ACTION_ENGINE_API_KEY', ''),
  },
};
