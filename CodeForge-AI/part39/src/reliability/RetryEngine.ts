import { AIGatewayError, normalizeError } from '../errors';
import { RETRYABLE_ERROR_CATEGORIES } from '../types';

export interface RetryOptions {
  maxAttempts: number; // total attempts including the first, so maxAttempts=3 means up to 2 retries
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RetryOutcome<T> {
  result: T;
  attempts: number;
}

export function isRetryable(err: unknown): boolean {
  const normalized = err instanceof AIGatewayError ? err : normalizeError(err, 'unknown');
  return normalized.retryable && RETRYABLE_ERROR_CATEGORIES.has(normalized.category);
}

function fullJitterDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.random() * exp;
}

/**
 * Retries only errors this codebase's error taxonomy marks retryable
 * (TIMEOUT, NETWORK_ERROR, PROVIDER_ERROR, RATE_LIMIT) — never
 * authentication failures, invalid requests, unsupported-capability
 * errors, or policy/budget/quota rejections, all of which will fail
 * identically on retry and would just waste a retry budget while making
 * the caller wait longer for the same failure.
 *
 * Retry attempts themselves are returned to the caller (see `.attempts`)
 * so the gateway can record them in telemetry — retries are not free and
 * a spike in retry rate is itself a signal worth tracking (see
 * telemetry/AnomalyDetector).
 */
export class RetryEngine {
  async execute<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<RetryOutcome<T>> {
    const baseDelayMs = opts.baseDelayMs ?? 200;
    const maxDelayMs = opts.maxDelayMs ?? 8_000;
    let lastError: unknown;

    for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
      try {
        const result = await fn(attempt);
        return { result, attempts: attempt + 1 };
      } catch (err) {
        lastError = err;
        const willRetry = attempt < opts.maxAttempts - 1 && isRetryable(err);
        if (!willRetry) throw err;
        await new Promise((resolve) => setTimeout(resolve, fullJitterDelay(attempt, baseDelayMs, maxDelayMs)));
      }
    }
    // Unreachable, but keeps TypeScript happy and fails loudly if it ever is reached.
    throw lastError;
  }
}

export const retryEngine = new RetryEngine();
