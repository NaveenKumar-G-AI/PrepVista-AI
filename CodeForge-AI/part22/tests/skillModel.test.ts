import { describe, expect, it } from "vitest";
import { createSession } from "../src/debugging/session.js";
import {
  buildReport,
  buildTimeline,
  computeEfficiencyMetrics,
  computeSkillProfile,
  determineResultStatus,
  type SessionEvidenceBundle
} from "../src/debugging/skillModel.js";

function emptyBundle(): SessionEvidenceBundle {
  const session = createSession({ id: "s1", userId: "u1", challengeId: "c1", submissionId: null, language: "python", startingCode: "" });
  return {
    session,
    fingerprint: null,
    reproductionAttempts: 0,
    reproduced: false,
    hypotheses: [],
    experiments: [],
    actions: [],
    rootCause: null,
    rootCauseValidation: null,
    regression: null,
    overfitting: null,
    hintsUsed: 0,
    timestamps: { failureObservedAt: null, firstHypothesisAt: null, rootCauseIdentifiedAt: null, fixSubmittedAt: null, regressionVerifiedAt: null }
  };
}

describe("computeSkillProfile", () => {
  it("marks every dimension INSUFFICIENT_EVIDENCE for a completely empty session, never guessing a score", () => {
    const bundle = emptyBundle();
    const dims = computeSkillProfile(bundle, computeEfficiencyMetrics(bundle));
    expect(dims).toHaveLength(10);
    expect(dims.every((d) => d.status === "INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(dims.every((d) => d.score === 0)).toBe(true);
  });

  it("every scored dimension carries non-empty evidence strings - numbers are always explainable", () => {
    const bundle = emptyBundle();
    bundle.fingerprint = {
      id: "f1",
      sessionId: "s1",
      failureType: "WRONG_ANSWER",
      input: "1",
      expectedOutput: "2",
      actualOutput: "1",
      errorMessage: null,
      stackTrace: null,
      sourceLocation: null,
      runtime: "python",
      executionTimeMs: 5,
      memoryUsageKB: null,
      reproductionStatus: "REPRODUCED",
      capturedAt: new Date().toISOString()
    };
    bundle.reproduced = true;
    bundle.reproductionAttempts = 1;

    const dims = computeSkillProfile(bundle, computeEfficiencyMetrics(bundle));
    for (const d of dims) {
      expect(Array.isArray(d.evidence)).toBe(true);
      if (d.status === "SCORED") expect(d.evidence.length).toBeGreaterThan(0);
    }
    const failureRecognition = dims.find((d) => d.dimension === "FAILURE_RECOGNITION")!;
    expect(failureRecognition.status).toBe("SCORED");
    expect(failureRecognition.score).toBeGreaterThan(0);
  });

  it("clamps every score into [0, 100] even under extreme inputs", () => {
    const bundle = emptyBundle();
    bundle.hypotheses = Array.from({ length: 50 }, (_, i) => ({
      id: `h${i}`,
      sessionId: "s1",
      text: "x",
      suspectedLocation: "loc",
      suspectedCause: null,
      confidence: 50,
      status: "SUPPORTED" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    const dims = computeSkillProfile(bundle, computeEfficiencyMetrics(bundle));
    expect(dims.every((d) => d.score >= 0 && d.score <= 100)).toBe(true);
  });
});

describe("determineResultStatus", () => {
  it("returns INSUFFICIENT_EVIDENCE when most dimensions are unscored, never a fabricated grade", () => {
    const bundle = emptyBundle();
    const dims = computeSkillProfile(bundle, computeEfficiencyMetrics(bundle));
    expect(determineResultStatus(dims)).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("never collapses to a bare PASS/FAIL - status is always one of the five nuanced states", () => {
    const bundle = emptyBundle();
    const dims = computeSkillProfile(bundle, computeEfficiencyMetrics(bundle));
    const status = determineResultStatus(dims);
    expect(["EXCELLENT_DEBUGGING", "STRONG_DEBUGGING", "DEVELOPING_DEBUGGING", "WEAK_DEBUGGING", "INSUFFICIENT_EVIDENCE"]).toContain(status);
  });
});

describe("buildTimeline", () => {
  it("is sorted chronologically and always includes session start", () => {
    const bundle = emptyBundle();
    const timeline = buildTimeline(bundle);
    expect(timeline[0]?.type).toBe("SESSION_STARTED");
    const times = timeline.map((e) => e.at);
    expect([...times].sort()).toEqual(times);
  });
});

describe("buildReport", () => {
  it("never leaves strengths/improvements empty, even with no evidence", () => {
    const bundle = emptyBundle();
    const dims = computeSkillProfile(bundle, computeEfficiencyMetrics(bundle));
    const report = buildReport(bundle, dims);
    expect(report.strengths.length).toBeGreaterThan(0);
    expect(report.improvements.length).toBeGreaterThan(0);
  });
});
