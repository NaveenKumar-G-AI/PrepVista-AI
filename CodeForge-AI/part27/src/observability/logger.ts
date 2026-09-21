/**
 * Minimal structured logger + in-process metrics registry (section 61).
 * A real deployment swaps ConsoleLogger's sink for whatever CodeForge
 * already ships to (Datadog, CloudWatch, ...) — every call site here stays
 * the same, only the transport changes.
 *
 * Deliberately redacts a fixed set of "likely to contain raw student
 * content" field names before anything is serialized, per the explicit
 * instruction not to log private source code or sensitive student content.
 */

export interface LogFields extends Record<string, unknown> {
  correlationId?: string;
}

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

const SENSITIVE_FIELD_NAMES = new Set(['sourceCode', 'code', 'explanationText', 'rawStudentText', 'studentText', 'submissionBody']);

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_FIELD_NAMES.has(k) ? '[redacted]' : v;
  }
  return out;
}

class ConsoleLogger implements Logger {
  info(msg: string, fields?: LogFields): void {
    this.emit('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.emit('warn', msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.emit('error', msg, fields);
  }
  private emit(level: 'info' | 'warn' | 'error', msg: string, fields?: LogFields): void {
    const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...(fields ? redact(fields) : {}) });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export const logger: Logger = new ConsoleLogger();

export function generateCorrelationId(): string {
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface TimingSummary {
  count: number;
  avgMs: number;
}

/**
 * Section 61's required counters (growth-analysis latency, evidence
 * ingestion latency, regression/recovery/milestone counts, cache hit
 * rate, ...) all flow through these two calls — incr() for counts,
 * recordDuration() for latency histograms.
 */
class MetricsRegistry {
  private counters = new Map<string, number>();
  private timings = new Map<string, number[]>();

  incr(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  recordDuration(name: string, ms: number): void {
    const arr = this.timings.get(name) ?? [];
    arr.push(ms);
    this.timings.set(name, arr);
  }

  snapshot(): { counters: Record<string, number>; timings: Record<string, TimingSummary> } {
    const timings: Record<string, TimingSummary> = {};
    for (const [name, arr] of this.timings) {
      const total = arr.reduce((sum, v) => sum + v, 0);
      timings[name] = { count: arr.length, avgMs: arr.length ? total / arr.length : 0 };
    }
    return { counters: Object.fromEntries(this.counters), timings };
  }
}

export const metrics = new MetricsRegistry();
