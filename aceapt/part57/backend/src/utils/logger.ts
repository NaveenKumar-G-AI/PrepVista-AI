/* Minimal structured logger. Swap for the real ACEAPT logging pipeline when
 * integrating - every call site here goes through this one module. */
type Fields = Record<string, unknown>;

function line(level: string, msg: string, fields?: Fields) {
  const entry = { level, msg, ts: new Date().toISOString(), ...fields };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

export const logger = {
  info: (msg: string, fields?: Fields) => line('info', msg, fields),
  warn: (msg: string, fields?: Fields) => line('warn', msg, fields),
  error: (msg: string, fields?: Fields) => line('error', msg, fields),
};
