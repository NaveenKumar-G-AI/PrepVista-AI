import { describe, it, expect } from "vitest";
import { generateSeries, applyMitigationRecovery } from "@/lib/engine/metricGen";
import { PF2048_TEMPLATE } from "@/content/incidents/pf-2048";

describe("metric generator determinism (brief: 'do not allow uncontrolled randomness to alter correctness')", () => {
  const opts = {
    controlPoints: [
      { offsetMinutes: -10, value: 10 },
      { offsetMinutes: 0, value: 100 },
      { offsetMinutes: 10, value: 100 },
    ],
    fromMinutes: -10,
    toMinutes: 10,
    stepMinutes: 1,
    wiggleAmplitude: 3,
  };

  it("produces byte-identical output across repeated calls with the same input", () => {
    const a = generateSeries(opts);
    const b = generateSeries(opts);
    expect(a).toEqual(b);
  });

  it("interpolates linearly between control points before any wiggle", () => {
    const flat = generateSeries({ ...opts, wiggleAmplitude: 0 });
    const midpoint = flat.find((p) => p.offsetMinutes === -5);
    expect(midpoint?.value).toBeCloseTo(55, 0); // halfway between 10 and 100
  });

  it("clamps to the configured bounds", () => {
    const clamped = generateSeries({ ...opts, wiggleAmplitude: 1000, clampMin: 0, clampMax: 100 });
    for (const p of clamped) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it("the full PF-2048 metric set is deterministic end to end", () => {
    // Re-import freshness isn't meaningful here (module is cached), but this
    // confirms the *authored* series has no NaN/undefined holes anywhere,
    // which is what would happen from an accidental non-deterministic gap.
    for (const [key, points] of Object.entries(PF2048_TEMPLATE.metricSeries)) {
      for (const p of points) {
        expect(Number.isFinite(p.value), `${key} has a non-finite value at offset ${p.offsetMinutes}`).toBe(true);
      }
    }
  });
});

describe("mitigation recovery blend", () => {
  const natural = [
    { offsetMinutes: 0, value: 18 },
    { offsetMinutes: 1, value: 18 },
    { offsetMinutes: 2, value: 18 },
    { offsetMinutes: 3, value: 18 },
    { offsetMinutes: 4, value: 18 },
    { offsetMinutes: 5, value: 18 },
  ];

  it("leaves the series untouched before mitigation", () => {
    const result = applyMitigationRecovery(natural, 0.2, null);
    expect(result).toEqual(natural);
  });

  it("blends toward baseline starting at the mitigation offset and holds flat after the recovery window", () => {
    const result = applyMitigationRecovery(natural, 0.2, 1, 4);
    expect(result.find((p) => p.offsetMinutes === 0)?.value).toBe(18); // before mitigation: untouched
    expect(result.find((p) => p.offsetMinutes === 1)?.value).toBe(18); // exactly at mitigation: elapsed=0
    const at3 = result.find((p) => p.offsetMinutes === 3)?.value ?? 0;
    expect(at3).toBeLessThan(18);
    expect(at3).toBeGreaterThan(0.2);
    expect(result.find((p) => p.offsetMinutes === 5)?.value).toBe(0.2); // past recovery window: fully healed
  });

  it("is a pure function — same inputs always produce the same output", () => {
    const a = applyMitigationRecovery(natural, 0.2, 2, 4);
    const b = applyMitigationRecovery(natural, 0.2, 2, 4);
    expect(a).toEqual(b);
  });
});
