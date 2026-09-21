/**
 * TIMEOUT MANAGEMENT + RETRY MANAGEMENT
 * -----------------------------------------------------------------------
 * - withTimeout: every external call gets a bounded wait — no uncontrolled
 *   indefinite hangs.
 * - isRetryable: retry only transient failures. Authorization/authentication
 *   failures and permanent configuration/input errors are never retried —
 *   retrying a 403 doesn't make it a 200, and hammering a dependency that
 *   is rejecting you for a permanent reason just adds load.
 * - withRetry: exponential backoff with full jitter (per AWS's well-known
 *   analysis of thundering-herd retry storms), bounded attempt count.
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Marker interface: dependency adapters should throw errors shaped like this so retry logic can classify them without guessing from message text. */
export interface ClassifiedError {
  retryable: boolean;
}

export function isClassifiedError(err: unknown): err is ClassifiedError & Error {
  return err instanceof Error && typeof (err as Partial<ClassifiedError>).retryable === "boolean";
}

/**
 * Default classifier used when an error isn't already ClassifiedError-shaped:
 * network-ish/5xx-ish errors are treated as transient; everything else
 * (4xx-shaped, validation, auth) is treated as permanent. Callers with
 * better information should throw ClassifiedError-shaped errors instead of
 * relying on this fallback.
 */
export function isRetryable(err: unknown): boolean {
  if (isClassifiedError(err)) return err.retryable;
  if (err instanceof TimeoutError) return true;
  const anyErr = err as { code?: string; status?: number; statusCode?: number };
  if (anyErr?.code && ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"].includes(anyErr.code)) return true;
  const status = anyErr?.status ?? anyErr?.statusCode;
  if (typeof status === "number") return status === 429 || status >= 500;
  return false;
}

export interface RetryOptions {
  maxAttempts: number; // total attempts including the first
  baseDelayMs: number;
  maxDelayMs: number;
  classify?: (err: unknown) => boolean;
}

function fullJitterBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(Math.random() * cap);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const classify = opts.classify ?? isRetryable;
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === opts.maxAttempts - 1;
      if (isLastAttempt || !classify(err)) {
        throw err;
      }
      const delay = fullJitterBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but keeps TS happy.
  throw lastError;
}
