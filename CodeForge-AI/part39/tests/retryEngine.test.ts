import { AIGatewayError } from '../src/errors';
import { isRetryable, RetryEngine } from '../src/reliability/RetryEngine';
import { ErrorCategory } from '../src/types';

function err(category: ErrorCategory, retryable: boolean) {
  return new AIGatewayError(category, 'test error', { retryable });
}

describe('isRetryable — classification', () => {
  it.each([
    [ErrorCategory.TIMEOUT, true],
    [ErrorCategory.NETWORK_ERROR, true],
    [ErrorCategory.PROVIDER_ERROR, true],
    [ErrorCategory.RATE_LIMIT, true],
  ])('%s is retryable when marked retryable', (category, retryableFlag) => {
    expect(isRetryable(err(category, retryableFlag))).toBe(true);
  });

  it.each([ErrorCategory.AUTHENTICATION, ErrorCategory.INVALID_REQUEST, ErrorCategory.POLICY_REJECTION, ErrorCategory.BUDGET_LIMIT, ErrorCategory.QUOTA_LIMIT])(
    '%s is never retried even if the error claims retryable:true',
    (category) => {
      expect(isRetryable(err(category, true))).toBe(false);
    }
  );
});

describe('RetryEngine — bounded retry behavior', () => {
  it('retries a transient failure and succeeds within the attempt budget', async () => {
    const engine = new RetryEngine();
    let calls = 0;
    const outcome = await engine.execute(async () => {
      calls++;
      if (calls < 3) throw err(ErrorCategory.TIMEOUT, true);
      return 'ok';
    }, { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 5 });

    expect(outcome.result).toBe('ok');
    expect(outcome.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const engine = new RetryEngine();
    let calls = 0;
    await expect(
      engine.execute(async () => {
        calls++;
        throw err(ErrorCategory.NETWORK_ERROR, true);
      }, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow();

    expect(calls).toBe(3); // never exceeds the configured budget
  });

  it('never retries a non-retryable error, even once', async () => {
    const engine = new RetryEngine();
    let calls = 0;
    await expect(
      engine.execute(async () => {
        calls++;
        throw err(ErrorCategory.AUTHENTICATION, false);
      }, { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow();

    expect(calls).toBe(1);
  });

  it('respects maxDelayMs as an upper bound on backoff (no runaway delay growth)', async () => {
    const engine = new RetryEngine();
    let calls = 0;
    const start = Date.now();
    await expect(
      engine.execute(async () => {
        calls++;
        throw err(ErrorCategory.TIMEOUT, true);
      }, { maxAttempts: 6, baseDelayMs: 20, maxDelayMs: 40 })
    ).rejects.toThrow();
    const elapsed = Date.now() - start;

    // 5 delays, each full-jitter within [0, 40ms] -> generous ceiling well
    // under what unbounded exponential growth (20 * 2^5 = 640ms/step)
    // would have produced.
    expect(elapsed).toBeLessThan(500);
    expect(calls).toBe(6);
  });
});
