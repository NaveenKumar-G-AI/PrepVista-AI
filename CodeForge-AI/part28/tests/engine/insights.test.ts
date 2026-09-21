import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateInsightsForDimension } from "../../src/lib/growth/engine/insights.ts";
import type { DimensionGrowth } from "../../src/lib/growth/types.ts";

function growth(overrides: Partial<DimensionGrowth>): DimensionGrowth {
  return {
    dimension: "debugging",
    state: "IMPROVING",
    trend: "POSITIVE",
    confidence: { level: "HIGH", score: 0.8, factors: { evidenceCount: 5, distinctChallengeFamilies: 3, recencyDays: 2, consistency: 0.9, hasTransferEvidence: false, meanSourceConfidence: 0.9 } },
    baselineState: "STABLE",
    evidenceWindow: { preset: "RECENT_90D", startsAt: null, endsAt: new Date().toISOString() },
    evidenceCount: 5,
    transferEvidenceCount: 0,
    retentionEvidenceCount: 0,
    independenceTrend: "FLAT",
    supportingEvidenceIds: ["e1", "e2"],
    velocity: "MODERATE",
    ...overrides,
  };
}

describe("generateInsightsForDimension", () => {
  test("INSUFFICIENT confidence produces zero insights regardless of state", () => {
    const g = growth({ state: "IMPROVING", confidence: { level: "INSUFFICIENT", score: 0.1, factors: { evidenceCount: 1, distinctChallengeFamilies: 1, recencyDays: 1, consistency: 0, hasTransferEvidence: false, meanSourceConfidence: 0.5 } } });
    assert.deepEqual(generateInsightsForDimension("student_1", g), []);
  });

  test("IMPROVING with real confidence produces an IMPROVEMENT insight referencing the baseline and current state", () => {
    const g = growth({ state: "IMPROVING", baselineState: "AT_RISK" });
    const insights = generateInsightsForDimension("student_1", g);
    const improvement = insights.find((i) => i.insightType === "IMPROVEMENT");
    assert.ok(improvement);
    assert.match(improvement!.claim, /at risk/i);
    assert.match(improvement!.claim, /improving/i);
    assert.deepEqual(improvement!.evidenceRefs, g.supportingEvidenceIds);
  });

  test("STAGNATING produces both a STAGNATION insight (adaptive-challenge recommendation) and an assessment-unsafe DEVELOPMENT_AREA insight", () => {
    const g = growth({ state: "STAGNATING", trend: "FLAT", velocity: null });
    const insights = generateInsightsForDimension("student_1", g);
    const stagnation = insights.find((i) => i.insightType === "STAGNATION");
    assert.ok(stagnation);
    assert.equal(stagnation!.recommendedAction?.kind, "ADAPTIVE_CHALLENGE");

    const devArea = insights.find((i) => i.insightType === "DEVELOPMENT_AREA");
    assert.ok(devArea);
    assert.equal(devArea!.assessmentSafe, false);
  });

  test("DEVELOPMENT_AREA claim never uses a blunt 'bad at X' framing", () => {
    const g = growth({ state: "AT_RISK", trend: "NEGATIVE" });
    const insights = generateInsightsForDimension("student_1", g);
    const devArea = insights.find((i) => i.insightType === "DEVELOPMENT_AREA");
    assert.ok(devArea);
    assert.doesNotMatch(devArea!.claim.toLowerCase(), /bad at/);
  });
});
