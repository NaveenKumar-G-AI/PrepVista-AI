const SENSITIVE_KEY_PATTERN = /source|apikey|api_key|secret|token|password/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

export function logEvent(event: string, meta: Record<string, unknown> = {}, correlationId?: string): void {
  const record = { timestamp: new Date().toISOString(), event, correlationId: correlationId || null, ...redact(meta) };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record));
}
