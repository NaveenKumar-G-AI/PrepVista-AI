/**
 * Minimal structured logger interface so the engine can be wired into
 * whatever the host app already uses (pino, winston, console, Datadog...).
 * Never pass secret values (API keys, tokens) through `fields`.
 */
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  info: (event, fields) => console.log(JSON.stringify({ level: "info", event, ...fields })),
  warn: (event, fields) => console.warn(JSON.stringify({ level: "warn", event, ...fields })),
  error: (event, fields) => console.error(JSON.stringify({ level: "error", event, ...fields })),
};

/** In-memory logger used by tests to assert on emitted events without stdout noise. */
export class MemoryLogger implements Logger {
  entries: Array<{ level: "info" | "warn" | "error"; event: string; fields?: Record<string, unknown> }> = [];
  info(event: string, fields?: Record<string, unknown>) {
    this.entries.push({ level: "info", event, fields });
  }
  warn(event: string, fields?: Record<string, unknown>) {
    this.entries.push({ level: "warn", event, fields });
  }
  error(event: string, fields?: Record<string, unknown>) {
    this.entries.push({ level: "error", event, fields });
  }
}
