import { describe, it, expect, vi } from "vitest";
import { ValidationExecutor } from "../../src/executor/ValidationExecutor.js";
import { ValidatorRegistry } from "../../src/registry/ValidatorRegistry.js";
import { InMemoryValidationCache } from "../../src/cache/ValidationCache.js";
import { buildResult } from "../../src/contracts/validator.js";
import type { Validator } from "../../src/contracts/validator.js";
import { baselineSnapshot, makePorts } from "../fixtures/baseline.js";

function fakeValidator(overrides: Partial<Validator> & { name: string }): Validator {
  return {
    category: "SCHEMA",
    version: "1.0.0",
    dependsOn: [],
    isApplicable: () => true,
    validate: async () => buildResult({ validator: overrides.name, category: "SCHEMA", status: "PASS", severity: "NONE", code: "VALID", message: "ok", validatorVersion: "1.0.0", startedAt: Date.now() }),
    ...overrides
  };
}

function baseInput() {
  return { questionVersion: baselineSnapshot(), mode: "DEEP" as const, context: { tenantId: null, requestedBy: { role: "SYSTEM" as const, id: "t" }, ports: makePorts() } };
}

describe("ValidationExecutor", () => {
  it("records SKIPPED (not FAIL, not ERROR) when a dependency did not pass (spec §93)", async () => {
    const registry = new ValidatorRegistry();
    registry.register(fakeValidator({ name: "A", validate: async () => buildResult({ validator: "A", category: "SCHEMA", status: "FAIL", severity: "CRITICAL", code: "SCHEMA_MISSING_FIELD", message: "bad", validatorVersion: "1.0.0", startedAt: Date.now() }) }));
    registry.register(fakeValidator({ name: "B", dependsOn: ["A"] }));

    const executor = new ValidationExecutor(registry);
    const results = await executor.execute({ layers: [["A"], ["B"]], allNames: ["A", "B"] }, baseInput());
    const b = results.find((r) => r.validator === "B")!;
    expect(b.status).toBe("SKIPPED");
    expect(b.code).toBe("DEPENDENCY_FAILED");
  });

  it("retries a transient thrown error and eventually succeeds", async () => {
    let attempts = 0;
    const registry = new ValidatorRegistry();
    registry.register(
      fakeValidator({
        name: "FLAKY",
        validate: async () => {
          attempts += 1;
          if (attempts < 2) throw new Error("transient infra blip");
          return buildResult({ validator: "FLAKY", category: "SCHEMA", status: "PASS", severity: "NONE", code: "VALID", message: "ok", validatorVersion: "1.0.0", startedAt: Date.now() });
        }
      })
    );
    const executor = new ValidationExecutor(registry, { timeoutMs: 1000, maxRetries: 2, retryBackoffMs: 5 });
    const results = await executor.execute({ layers: [["FLAKY"]], allNames: ["FLAKY"] }, baseInput());
    expect(results[0]!.status).toBe("PASS");
    expect(attempts).toBe(2);
  });

  it("reports VALIDATOR_TIMEOUT (an ERROR, not a content FAIL) when a validator hangs past its budget (spec §83, §207)", async () => {
    const registry = new ValidatorRegistry();
    registry.register(fakeValidator({ name: "SLOW", validate: () => new Promise((resolve) => setTimeout(() => resolve(buildResult({ validator: "SLOW", category: "SCHEMA", status: "PASS", severity: "NONE", code: "VALID", message: "ok", validatorVersion: "1.0.0", startedAt: Date.now() })), 5000)) }));
    const executor = new ValidationExecutor(registry, { timeoutMs: 50, maxRetries: 0, retryBackoffMs: 5 });
    const results = await executor.execute({ layers: [["SLOW"]], allNames: ["SLOW"] }, baseInput());
    expect(results[0]!.status).toBe("ERROR");
    expect(results[0]!.code).toBe("VALIDATOR_TIMEOUT");
  });

  it("does NOT retry a normal content FAIL result (spec §84, §209 — content failure vs infra error)", async () => {
    let calls = 0;
    const registry = new ValidatorRegistry();
    registry.register(
      fakeValidator({
        name: "BROKEN_CONTENT",
        validate: async () => {
          calls += 1;
          return buildResult({ validator: "BROKEN_CONTENT", category: "SCHEMA", status: "FAIL", severity: "CRITICAL", code: "MATH_INVALID", message: "genuinely wrong", validatorVersion: "1.0.0", startedAt: Date.now() });
        }
      })
    );
    const executor = new ValidationExecutor(registry, { timeoutMs: 1000, maxRetries: 3, retryBackoffMs: 5 });
    const results = await executor.execute({ layers: [["BROKEN_CONTENT"]], allNames: ["BROKEN_CONTENT"] }, baseInput());
    expect(results[0]!.status).toBe("FAIL");
    expect(calls).toBe(1); // a real content FAIL must never trigger the retry loop
  });

  it("serves a cache hit without re-invoking the validator, tagging it in evidence (spec §61, §199)", async () => {
    const registry = new ValidatorRegistry();
    const validateSpy = vi.fn(async () => buildResult({ validator: "CACHED", category: "SCHEMA", status: "PASS", severity: "NONE", code: "VALID", message: "ok", validatorVersion: "1.0.0", startedAt: Date.now() }));
    registry.register(fakeValidator({ name: "CACHED", validate: validateSpy }));
    const cache = new InMemoryValidationCache();
    const executor = new ValidationExecutor(registry, undefined, cache);

    const input = baseInput();
    await executor.execute({ layers: [["CACHED"]], allNames: ["CACHED"] }, input);
    const second = await executor.execute({ layers: [["CACHED"]], allNames: ["CACHED"] }, input);

    expect(validateSpy).toHaveBeenCalledTimes(1); // second run was a cache hit
    expect(second[0]!.evidence._servedFromCache).toBe(true);
  });

  it("bypasses cache reads for REVALIDATION-style requests but still repopulates the cache (spec §129)", async () => {
    const registry = new ValidatorRegistry();
    const validateSpy = vi.fn(async () => buildResult({ validator: "REVAL", category: "SCHEMA", status: "PASS", severity: "NONE", code: "VALID", message: "ok", validatorVersion: "1.0.0", startedAt: Date.now() }));
    registry.register(fakeValidator({ name: "REVAL", validate: validateSpy }));
    const cache = new InMemoryValidationCache();
    const executor = new ValidationExecutor(registry, undefined, cache);
    const input = baseInput();

    await executor.execute({ layers: [["REVAL"]], allNames: ["REVAL"] }, input);
    await executor.execute({ layers: [["REVAL"]], allNames: ["REVAL"] }, input, { bypassCacheRead: true });

    expect(validateSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidates cached results when the validator's version changes (spec §200)", async () => {
    const cache = new InMemoryValidationCache();
    const result = buildResult({ validator: "X", category: "SCHEMA", status: "PASS", severity: "NONE", code: "VALID", message: "ok", validatorVersion: "1.0.0", startedAt: Date.now() });
    await cache.set("hash1", "X", "1.0.0", "DEEP", result);
    expect(await cache.get("hash1", "X", "1.0.0", "DEEP")).not.toBeNull();
    await cache.invalidateValidator("X", "1.0.0");
    expect(await cache.get("hash1", "X", "1.0.0", "DEEP")).toBeNull();
  });
});
