import { describe, expect, it } from "vitest";
import { checkComparability } from "../comparability.js";
import { calculateConfidence } from "../confidence.js";
import { calculateGrowth } from "../growth.js";
import { detectMilestones } from "../milestones.js";
import type { EvidenceRef, SkillObservation } from "../types.js";
import { isGrowthAvailable } from "../types.js";

function evidence(over: Partial<EvidenceRef> & { id: string; observedAt: string }): EvidenceRef {
  return {
    type: "CHALLENGE_SUBMISSION",
    skillId: "algorithms",
    ...over,
  };
}

function observation(over: Partial<SkillObservation> & { value: number; observedAt: string }): SkillObservation {
  return {
    skillId: "algorithms",
    calculationVersion: "v1",
    sourceType: "AGGREGATED_SIGNAL",
    evidence: [],
    ...over,
  };
}

describe("checkComparability", () => {
  const baseline = observation({
    value: 50,
    observedAt: "2026-06-01T00:00:00Z",
    evidence: [
      evidence({ id: "e1", observedAt: "2026-05-30T00:00:00Z" }),
      evidence({ id: "e2", observedAt: "2026-05-31T00:00:00Z" }),
      evidence({ id: "e3", observedAt: "2026-06-01T00:00:00Z" }),
    ],
  });

  it("allows comparison when skill, version, evidence, and time separation all check out", () => {
    const current = observation({
      value: 68,
      observedAt: "2026-07-15T00:00:00Z",
      evidence: [
        evidence({ id: "e4", observedAt: "2026-07-10T00:00:00Z" }),
        evidence({ id: "e5", observedAt: "2026-07-12T00:00:00Z" }),
        evidence({ id: "e6", observedAt: "2026-07-14T00:00:00Z" }),
        evidence({ id: "e7", observedAt: "2026-07-15T00:00:00Z" }),
      ],
    });
    expect(checkComparability(baseline, current)).toEqual({ comparable: true, reasons: [] });
  });

  it("rejects comparison across incompatible calculation versions", () => {
    const current = observation({
      value: 68,
      observedAt: "2026-07-15T00:00:00Z",
      calculationVersion: "v2-experimental",
      evidence: [
        evidence({ id: "e4", observedAt: "2026-07-10T00:00:00Z" }),
        evidence({ id: "e5", observedAt: "2026-07-12T00:00:00Z" }),
        evidence({ id: "e6", observedAt: "2026-07-14T00:00:00Z" }),
      ],
    });
    const result = checkComparability(baseline, current);
    expect(result.comparable).toBe(false);
    expect(result.reasons).toContain("INCOMPATIBLE_CALCULATION_VERSION");
  });

  it("rejects comparison when current evidence is too thin", () => {
    const current = observation({
      value: 68,
      observedAt: "2026-07-15T00:00:00Z",
      evidence: [evidence({ id: "e4", observedAt: "2026-07-14T00:00:00Z" })],
    });
    const result = checkComparability(baseline, current);
    expect(result.comparable).toBe(false);
    expect(result.reasons).toContain("INSUFFICIENT_EVIDENCE");
  });

  it("rejects comparison when observations are too close in time", () => {
    const current = observation({
      value: 55,
      observedAt: "2026-06-01T06:00:00Z",
      evidence: [
        evidence({ id: "e4", observedAt: "2026-06-01T02:00:00Z" }),
        evidence({ id: "e5", observedAt: "2026-06-01T04:00:00Z" }),
        evidence({ id: "e6", observedAt: "2026-06-01T06:00:00Z" }),
      ],
    });
    const result = checkComparability(baseline, current);
    expect(result.comparable).toBe(false);
    expect(result.reasons).toContain("INSUFFICIENT_TIME_SEPARATION");
  });
});

describe("calculateConfidence", () => {
  it("returns INSUFFICIENT for a single piece of evidence", () => {
    const obs = observation({
      value: 80,
      observedAt: "2026-08-01T00:00:00Z",
      evidence: [evidence({ id: "e1", observedAt: "2026-08-01T00:00:00Z" })],
    });
    expect(calculateConfidence(obs)).toBe("INSUFFICIENT");
  });

  it("returns LOW for thin, stale, undiverse evidence", () => {
    const obs = observation({
      value: 62,
      observedAt: "2026-08-01T00:00:00Z",
      evidence: [
        evidence({ id: "e1", observedAt: "2026-05-01T00:00:00Z", problemFamily: "sorting" }),
        evidence({ id: "e2", observedAt: "2026-05-02T00:00:00Z", problemFamily: "sorting" }),
      ],
    });
    expect(calculateConfidence(obs)).toBe("LOW");
  });

  it("returns HIGH for abundant, diverse, recent evidence", () => {
    const families = ["sorting", "graphs", "dp", "greedy"];
    const evList: EvidenceRef[] = Array.from({ length: 12 }, (_, i) =>
      evidence({
        id: `e${i}`,
        observedAt: "2026-08-15T00:00:00Z",
        type: i % 2 === 0 ? "CHALLENGE_SUBMISSION" : "ADAPTIVE_CHALLENGE",
        problemFamily: families[i % families.length],
      })
    );
    const obs = observation({ value: 74, observedAt: "2026-08-15T00:00:00Z", evidence: evList });
    expect(calculateConfidence(obs)).toBe("HIGH");
  });
});

describe("calculateGrowth", () => {
  it("computes a real delta when states are comparable", () => {
    const baseline = observation({
      value: 38,
      observedAt: "2026-06-01T00:00:00Z",
      evidence: [evidence({ id: "b1", observedAt: "2026-06-01T00:00:00Z" })],
    });
    const current = observation({
      value: 69,
      observedAt: "2026-08-01T00:00:00Z",
      evidence: [
        evidence({ id: "c1", observedAt: "2026-07-20T00:00:00Z" }),
        evidence({ id: "c2", observedAt: "2026-07-25T00:00:00Z" }),
        evidence({ id: "c3", observedAt: "2026-08-01T00:00:00Z" }),
      ],
    });
    const result = calculateGrowth(baseline, current);
    expect(isGrowthAvailable(result)).toBe(true);
    if (isGrowthAvailable(result)) {
      expect(result.absoluteChange).toBe(31);
      expect(result.evidenceCount).toBe(3);
    }
  });

  it("refuses to manufacture a value when comparability fails", () => {
    const baseline = observation({ value: 90, observedAt: "2026-06-01T00:00:00Z" });
    const current = observation({
      value: 78,
      observedAt: "2026-06-02T00:00:00Z",
      evidence: [evidence({ id: "c1", observedAt: "2026-06-02T00:00:00Z" })],
    });
    const result = calculateGrowth(baseline, current);
    expect(result.unavailable).toBe(true);
  });
});

describe("detectMilestones", () => {
  it("awards FIRST_VERIFIED_MASTERY only with high-confidence evidence, not just a high score", () => {
    const families = ["sorting", "graphs", "dp"];
    const strongEvidence: EvidenceRef[] = Array.from({ length: 8 }, (_, i) =>
      evidence({
        id: `strong${i}`,
        observedAt: "2026-08-10T00:00:00Z",
        problemFamily: families[i % families.length],
        type: i % 2 === 0 ? "CHALLENGE_SUBMISSION" : "ADAPTIVE_CHALLENGE",
      })
    );

    const withHighConfidence = detectMilestones("algorithms", [
      observation({ value: 55, observedAt: "2026-06-01T00:00:00Z" }),
      observation({ value: 85, observedAt: "2026-08-10T00:00:00Z", evidence: strongEvidence }),
    ]);
    expect(withHighConfidence.some((m) => m.type === "FIRST_VERIFIED_MASTERY")).toBe(true);

    const withOneOffScore = detectMilestones("algorithms", [
      observation({ value: 55, observedAt: "2026-06-01T00:00:00Z" }),
      observation({
        value: 85,
        observedAt: "2026-08-10T00:00:00Z",
        evidence: [evidence({ id: "lucky1", observedAt: "2026-08-10T00:00:00Z" })],
      }),
    ]);
    expect(withOneOffScore.some((m) => m.type === "FIRST_VERIFIED_MASTERY")).toBe(false);
  });

  it("requires distinct problem families for DEBUGGING_MILESTONE, resisting repeated-trivial-challenge gaming", () => {
    const repeatedFamily = detectMilestones("debugging", [
      observation({
        value: 60,
        observedAt: "2026-08-01T00:00:00Z",
        evidence: [
          evidence({ id: "d1", type: "DEBUGGING_TASK", observedAt: "2026-07-01T00:00:00Z", problemFamily: "null-pointer" }),
          evidence({ id: "d2", type: "DEBUGGING_TASK", observedAt: "2026-07-05T00:00:00Z", problemFamily: "null-pointer" }),
          evidence({ id: "d3", type: "DEBUGGING_TASK", observedAt: "2026-07-10T00:00:00Z", problemFamily: "null-pointer" }),
          evidence({ id: "d4", type: "DEBUGGING_TASK", observedAt: "2026-07-15T00:00:00Z", problemFamily: "off-by-one" }),
        ],
      }),
    ]);
    expect(repeatedFamily.some((m) => m.type === "DEBUGGING_MILESTONE")).toBe(false);

    const distinctFamilies = detectMilestones("debugging", [
      observation({
        value: 60,
        observedAt: "2026-08-01T00:00:00Z",
        evidence: [
          evidence({ id: "d1", type: "DEBUGGING_TASK", observedAt: "2026-07-01T00:00:00Z", problemFamily: "null-pointer" }),
          evidence({ id: "d2", type: "DEBUGGING_TASK", observedAt: "2026-07-05T00:00:00Z", problemFamily: "off-by-one" }),
          evidence({ id: "d3", type: "DEBUGGING_TASK", observedAt: "2026-07-10T00:00:00Z", problemFamily: "race-condition" }),
        ],
      }),
    ]);
    expect(distinctFamilies.some((m) => m.type === "DEBUGGING_MILESTONE")).toBe(true);
  });

  it("does not award DEBUGGING_MILESTONE or FIRST_TRANSFER_SUCCESS for failed attempts", () => {
    const failedAttempts = detectMilestones("debugging", [
      observation({
        value: 40,
        observedAt: "2026-08-01T00:00:00Z",
        evidence: [
          evidence({ id: "f1", type: "DEBUGGING_TASK", observedAt: "2026-07-01T00:00:00Z", problemFamily: "null-pointer", successful: false }),
          evidence({ id: "f2", type: "DEBUGGING_TASK", observedAt: "2026-07-05T00:00:00Z", problemFamily: "off-by-one", successful: false }),
          evidence({ id: "f3", type: "DEBUGGING_TASK", observedAt: "2026-07-10T00:00:00Z", problemFamily: "race-condition", successful: false }),
          evidence({ id: "f4", type: "CHALLENGE_SUBMISSION", observedAt: "2026-07-12T00:00:00Z", isTransfer: true, successful: false }),
        ],
      }),
    ]);
    expect(failedAttempts.some((m) => m.type === "DEBUGGING_MILESTONE")).toBe(false);
    expect(failedAttempts.some((m) => m.type === "FIRST_TRANSFER_SUCCESS")).toBe(false);
  });

  it("awards ASSESSMENT_IMPROVEMENT only above the meaningful-gain threshold", () => {
    const bigGain = detectMilestones("algorithms", [
      observation({ value: 50, observedAt: "2026-06-01T00:00:00Z", sourceType: "ASSESSMENT" }),
      observation({ value: 65, observedAt: "2026-07-15T00:00:00Z", sourceType: "ASSESSMENT" }),
    ]);
    expect(bigGain.some((m) => m.type === "ASSESSMENT_IMPROVEMENT")).toBe(true);

    const smallGain = detectMilestones("algorithms", [
      observation({ value: 50, observedAt: "2026-06-01T00:00:00Z", sourceType: "ASSESSMENT" }),
      observation({ value: 54, observedAt: "2026-07-15T00:00:00Z", sourceType: "ASSESSMENT" }),
    ]);
    expect(smallGain.some((m) => m.type === "ASSESSMENT_IMPROVEMENT")).toBe(false);
  });
});
