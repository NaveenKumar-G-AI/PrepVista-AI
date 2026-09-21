import { describe, it, expect } from "vitest";
import { RateLimiter, MemoryRateLimitStore } from "../src/lib/rateLimiter";

describe("RateLimiter", () => {
  it("allows requests up to the limit, then denies further requests in the same window", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore(), 3, 60_000);

    const first = await limiter.check("key-a");
    const second = await limiter.check("key-a");
    const third = await limiter.check("key-a");
    const fourth = await limiter.check("key-a");

    expect([first, second, third].every((d) => d.allowed)).toBe(true);
    expect(fourth.allowed).toBe(false);
    expect(fourth.count).toBe(4);
    expect(fourth.limit).toBe(3);
  });

  it("tracks separate keys independently", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore(), 1, 60_000);

    const a1 = await limiter.check("a");
    const b1 = await limiter.check("b");
    const a2 = await limiter.check("a");

    expect(a1.allowed).toBe(true);
    expect(b1.allowed).toBe(true); // a different key is not affected by a's count
    expect(a2.allowed).toBe(false);
  });

  it("resets once the window elapses", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore(), 1, 30);

    const first = await limiter.check("key");
    expect(first.allowed).toBe(true);

    const second = await limiter.check("key");
    expect(second.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 40));

    const third = await limiter.check("key");
    expect(third.allowed).toBe(true);
    expect(third.count).toBe(1); // fresh window, counter restarted
  });
});

describe("MemoryRateLimitStore", () => {
  it("increments and creates a fresh window when none exists", async () => {
    const store = new MemoryRateLimitStore();
    expect(await store.incrementAndGet("k", 1000)).toBe(1);
    expect(await store.incrementAndGet("k", 1000)).toBe(2);
    expect(await store.incrementAndGet("k", 1000)).toBe(3);
  });

  it("reset() clears all windows", async () => {
    const store = new MemoryRateLimitStore();
    await store.incrementAndGet("k", 1000);
    store.reset();
    expect(await store.incrementAndGet("k", 1000)).toBe(1);
  });
});
