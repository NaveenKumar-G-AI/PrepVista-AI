/**
 * Structured, machine-parseable logging (section 60). Every line is a
 * single JSON object to stdout — real observability infra (Datadog,
 * CloudWatch, an ELK stack) can ingest this directly without a special
 * parser. Deliberately never logs secrets, API keys, or raw submitted code
 * (section 60: "Never log: API keys, passwords, secrets, sensitive student
 * data unnecessarily").
 */
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else console.log(out);
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};
