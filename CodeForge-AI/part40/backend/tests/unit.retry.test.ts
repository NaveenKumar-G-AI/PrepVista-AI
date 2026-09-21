import { describe, it, expect, vi } from "vitest";
import { withTimeout, withRetry, isRetryable, TimeoutError, type ClassifiedError } from "../src/lib/retry";

describe("withTimeout", () => {
  it("resolves normally when the operation finishes before the deadline", async () => {
    const result = await withTimeout(async () => "done", 100);
    expect(result).toBe("done");
  });

  it("rejects with TimeoutError when the operation exceeds the deadline, without waiting for it to finish", async () => {
    const start = Date.now();
    await expect(
      withTimeout(() => new Promise((r) => setTimeout(() => r("too late"), 500)), 30)
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(Date.now() - start).toBeLessThan(200); // rejected near the 30ms deadline, not after the full 500ms
  });
});

describe("isRetryable", () => {
  it("treats an explicit ClassifiedError as authoritative over any heuristic", () => {
    const retryableError: ClassifiedError & Error = Object.assign(new Error("x"), { retryable: true });
    const permanentError: ClassifiedError & Error = Object.assign(new Error("y"), { retryable: false });
    expect(isRetryable(retryableError)).toBe(true);
    expect(isRetryable(permanentError)).toBe(false);
  });

  it("treats a TimeoutError as retryable", () => {
    expect(isRetryable(new TimeoutError(100))).toBe(true);
  });

  it("treats network-reset-shaped errors as retryable", () => {
    expect(isRetryable(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(true);
    expect(isRetryable(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe(true);
  });

  it("treats HTTP 429 and 5xx as retryable, but 4xx (other than 429) as permanent", () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 403 })).toBe(false);
    expect(isRetryable({ status: 400 })).toBe(false);
  });

  it("treats an unrecognized plain error as permanent by default (fails closed toward NOT retrying)", () => {
    expect(isRetryable(new Error("some validation problem"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the first successful result without retrying when there's no failure", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and eventually succeeds, up to maxAttempts", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("transient"), { retryable: true });
      return "ok on 3rd try";
    });
    const result = await withRetry(fn, { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe("ok on 3rd try");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a permanent (non-retryable) failure — fails on the first attempt", async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("permanent — bad input"), { retryable: false });
    });
    await expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and surfaces the last error", async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("always fails"), { retryable: true });
    });
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects a custom classify function over the default heuristic", async () => {
    const fn = vi.fn(async () => {
      throw new Error("custom-classified");
    });
    // Default isRetryable would treat a bare Error as permanent; override says retry it.
    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, classify: () => true })
    ).rejects.toThrow("custom-classified");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
