// Minimal structured logger. In ACEAPT's real stack this should be swapped
// for whatever the platform already uses (pino/winston/APM agent) — kept
// deliberately dependency-free here so this service has zero surprise
// requirements. Every log line is a single JSON object for easy ingestion.

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'test') write('debug', message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
