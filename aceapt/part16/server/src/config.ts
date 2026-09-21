import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny .env loader (no dependency on the `dotenv` package). Reads
 * KEY=VALUE lines from a .env file at the server root if present.
 * All keys are optional and blank by default — fill them in as you
 * wire this up to your real infrastructure.
 */
function loadDotEnv(): void {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  port: Number(process.env.PORT || 4000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'claude-sonnet-5',
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

export const isLlmConfigured = (): boolean => config.anthropicApiKey.trim().length > 0;
