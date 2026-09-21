import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../src/lib/circuitBreaker";

function breaker(overrides: Partial<ConstructorParameters<typeof CircuitBreaker>[0]> = {}) {
  return new CircuitBreaker({
    name: "test",
    failureThreshold: 3,
    successThreshold: 2,
    openDurationMs: 50,
    ...overrides
  });
}

describe("CircuitBreaker", () => {
  it("starts CLOSED and stays CLOSED while calls succeed", async () => {
    const b = breaker();
    for (let i = 0; i < 5; i++) {
      await b.execute(async () => "ok");
    }
    expect(b.getState()).toBe("CLOSED");
  });

  it("opens after `failureThreshold` consecutive failures, and rejects further calls without invoking them", async () => {
    const b = breaker({ failureThreshold: 3 });
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });

    for (let i = 0; i < 3; i++) {
      await expect(b.execute(fn)).rejects.toThrow("boom");
    }
    expect(b.getState()).toBe("OPEN");
    expect(fn).toHaveBeenCalledTimes(3);

    // A 4th call must be rejected WITHOUT calling fn again — that's the point of the breaker.
    await expect(b.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("an isolated failure below the threshold does not open the breaker (resets on success)", async () => {
    const b = breaker({ failureThreshold: 3 });
    await expect(b.execute(async () => { throw new Error("one-off"); })).rejects.toThrow();
    await b.execute(async () => "ok"); // success resets the consecutive-failure counter
    await expect(b.execute(async () => { throw new Error("one-off-2"); })).rejects.toThrow();
    expect(b.getState()).toBe("CLOSED"); // still only 1 consecutive failure, never reached 3
  });

  it("transitions OPEN -> HALF_OPEN after openDurationMs, then CLOSED after `successThreshold` probe successes", async () => {
    const b = breaker({ failureThreshold: 1, successThreshold: 2, openDurationMs: 30 });
    await expect(b.execute(async () => { throw new Error("trip it"); })).rejects.toThrow();
    expect(b.getState()).toBe("OPEN");

    await new Promise((r) => setTimeout(r, 40));
    expect(b.getState()).toBe("HALF_OPEN");

    await b.execute(async () => "probe 1 ok");
    expect(b.getState()).toBe("HALF_OPEN"); // needs 2 successes, only 1 so far

    await b.execute(async () => "probe 2 ok");
    expect(b.getState()).toBe("CLOSED");
  });

  it("a single failure during HALF_OPEN immediately re-opens the breaker", async () => {
    const b = breaker({ failureThreshold: 1, successThreshold: 2, openDurationMs: 20 });
    await expect(b.execute(async () => { throw new Error("trip it"); })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 25));
    expect(b.getState()).toBe("HALF_OPEN");

    await expect(b.execute(async () => { throw new Error("probe failed"); })).rejects.toThrow("probe failed");
    expect(b.getState()).toBe("OPEN");
  });

  it("calls onStateChange with the correct from/to pairs", async () => {
    const transitions: Array<[string, string]> = [];
    const b = breaker({
      failureThreshold: 1,
      openDurationMs: 20,
      onStateChange: (from, to) => transitions.push([from, to])
    });

    await expect(b.execute(async () => { throw new Error("x"); })).rejects.toThrow();
    expect(transitions).toEqual([["CLOSED", "OPEN"]]);

    await new Promise((r) => setTimeout(r, 25));
    b.getState(); // triggers the lazy OPEN -> HALF_OPEN check
    expect(transitions).toEqual([
      ["CLOSED", "OPEN"],
      ["OPEN", "HALF_OPEN"]
    ]);
  });
});
