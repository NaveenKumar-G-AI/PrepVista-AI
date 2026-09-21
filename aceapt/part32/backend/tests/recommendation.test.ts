import { describe, expect, it } from "vitest";
import { buildRecommendations, parseRecommendationId, recommendationId } from "../src/services/recommendation.service.js";
import { TemplateExplanationProvider } from "../src/services/explanation.service.js";
import type { CapabilityGap } from "../src/types/domain.js";

function gap(overrides: Partial<CapabilityGap & { priorityScore: number }>): CapabilityGap & { priorityScore: number } {
  return {
    capabilityId: "dsa",
    capabilityName: "Data Structures & Algorithms",
    category: "technical",
    weight: 0.35,
    targetBar: 70,
    currentScore: 50,
    gap: 20,
    trend: "STABLE",
    confidence: "HIGH",
    evidenceCount: 3,
    lastAssessedAt: new Date().toISOString(),
    evidence: [],
    onTrack: false,
    priorityScore: 7,
    ...overrides,
  };
}

describe("recommendation id encoding", () => {
  it("round-trips capabilityId and actionType", () => {
    const id = recommendationId("prog_fund", "TARGETED_PRACTICE");
    expect(parseRecommendationId(id)).toEqual({ capabilityId: "prog_fund", actionType: "TARGETED_PRACTICE" });
  });
});

describe("buildRecommendations", () => {
  const provider = new TemplateExplanationProvider();

  it("buckets by rank into DO_FIRST (max 2), DO_NEXT (max 2), then OPTIONAL", async () => {
    const gaps = [
      gap({ capabilityId: "a", priorityScore: 9, evidenceCount: 0, currentScore: null, gap: null }),
      gap({ capabilityId: "b", priorityScore: 8 }),
      gap({ capabilityId: "c", priorityScore: 5 }),
      gap({ capabilityId: "d", priorityScore: 3 }),
      gap({ capabilityId: "e", priorityScore: 1 }),
    ];
    const result = await buildRecommendations(gaps, provider, []);
    expect(result.doFirst.map((r) => r.capabilityId)).toEqual(["a", "b"]);
    expect(result.doNext.map((r) => r.capabilityId)).toEqual(["c", "d"]);
    expect(result.optional.map((r) => r.capabilityId)).toEqual(["e"]);
  });

  it("excludes capabilities that are already on track", async () => {
    const gaps = [gap({ capabilityId: "on-track", gap: 0, onTrack: true, priorityScore: 0 })];
    const result = await buildRecommendations(gaps, provider, []);
    const all = [...result.doFirst, ...result.doNext, ...result.optional];
    expect(all.find((r) => r.capabilityId === "on-track")).toBeUndefined();
  });

  it("routes unassessed capabilities to a TAKE_ASSESSMENT action, not a practice action", async () => {
    const gaps = [gap({ capabilityId: "comm", category: "soft_skill", evidenceCount: 0, currentScore: null, gap: null, priorityScore: 9 })];
    const result = await buildRecommendations(gaps, provider, []);
    expect(result.doFirst[0]?.actionType).toBe("TAKE_ASSESSMENT");
  });

  it("attaches the most recent complete/skip event for a recommendation, when one exists", async () => {
    const gaps = [gap({ capabilityId: "dsa", priorityScore: 9 })];
    const id = recommendationId("dsa", "TARGETED_PRACTICE");
    const events = [
      {
        id: "e1",
        studentId: "s1",
        type: "ACTION_SKIPPED" as const,
        payload: { recommendationId: id },
        createdAt: new Date().toISOString(),
      },
    ];
    const result = await buildRecommendations(gaps, provider, events);
    expect(result.doFirst[0]?.lastActionEvent?.type).toBe("ACTION_SKIPPED");
  });
});
