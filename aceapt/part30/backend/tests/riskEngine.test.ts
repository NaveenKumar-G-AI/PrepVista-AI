import { describe, it, expect } from "vitest";
import { detectRisks, type RiskInput } from "../src/engine/riskEngine.js";
import type { EvidenceEvent, PathSnapshot } from "../src/domain/types.js";

function baseInput(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    gaps: [],
    states: [],
    snapshots: [],
    recentEvidenceByCapability: new Map(),
    deadlineDays: null,
    readiness: 50,
    targetReadiness: 90,
    projectedWeeksHigh: null,
    regressedVerifiedCapabilities: [],
    ...overrides,
  };
}

function snapshot(readiness: number, takenAt: string): PathSnapshot {
  return { id: "s", pathId: "p1", stageKey: "x", readiness, bottleneckCapability: null, takenAt };
}

describe("detectRisks -- STALLING", () => {
  it("regression test: does NOT fire when 3 recalculations happen within minutes of each other, even with flat readiness", () => {
    // This is the exact bug found by running the server live: a burst of
    // API calls (proving several already-satisfied milestones back to
    // back) produced several recalculations within seconds, all with
    // unchanged readiness, and that alone should never read as "stalled".
    const now = Date.now();
    const snapshots = [snapshot(80, new Date(now - 2000).toISOString()), snapshot(80, new Date(now - 1000).toISOString()), snapshot(80, new Date(now).toISOString())];
    const risks = detectRisks(baseInput({ snapshots }));
    expect(risks.find((r) => r.type === "STALLING")).toBeUndefined();
  });

  it("fires when readiness is flat across a real (12h+) window", () => {
    const now = Date.now();
    const snapshots = [
      snapshot(80, new Date(now - 3 * 86400000).toISOString()),
      snapshot(80.2, new Date(now - 2 * 86400000).toISOString()),
      snapshot(80.3, new Date(now).toISOString()),
    ];
    const risks = detectRisks(baseInput({ snapshots }));
    expect(risks.find((r) => r.type === "STALLING")).toBeDefined();
  });

  it("does not fire when readiness is genuinely moving", () => {
    const now = Date.now();
    const snapshots = [
      snapshot(70, new Date(now - 3 * 86400000).toISOString()),
      snapshot(76, new Date(now - 2 * 86400000).toISOString()),
      snapshot(82, new Date(now).toISOString()),
    ];
    const risks = detectRisks(baseInput({ snapshots }));
    expect(risks.find((r) => r.type === "STALLING")).toBeUndefined();
  });
});

describe("detectRisks -- REPEATED_FAILURE", () => {
  it("fires only when the last 3+ graded attempts on one capability all failed", () => {
    const failEvent = (daysAgo: number): EvidenceEvent => ({
      id: "e", studentId: "s1", capabilityCode: "cap.a", type: "PERFORMANCE", source: "test",
      result: { passed: false }, occurredAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    });
    const map = new Map([["cap.a", [failEvent(1), failEvent(2), failEvent(3)]]]);
    const risks = detectRisks(baseInput({ recentEvidenceByCapability: map }));
    expect(risks.find((r) => r.type === "REPEATED_FAILURE")).toBeDefined();
  });

  it("does not fire on a mixed pass/fail history", () => {
    const event = (passed: boolean, daysAgo: number): EvidenceEvent => ({
      id: "e", studentId: "s1", capabilityCode: "cap.a", type: "PERFORMANCE", source: "test",
      result: { passed }, occurredAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    });
    const map = new Map([["cap.a", [event(true, 1), event(false, 2), event(false, 3)]]]);
    const risks = detectRisks(baseInput({ recentEvidenceByCapability: map }));
    expect(risks.find((r) => r.type === "REPEATED_FAILURE")).toBeUndefined();
  });
});

describe("detectRisks -- TRANSFER_FAILURE", () => {
  it("fires when accuracy is solid but transfer lags well behind it", () => {
    const risks = detectRisks(
      baseInput({
        states: [{ studentId: "s1", capabilityCode: "cap.a", level: 70, accuracy: 85, speed: 70, transfer: 55, consistency: 70, evidenceCount: 5, lastEvidenceAt: "now" }],
      })
    );
    expect(risks.find((r) => r.type === "TRANSFER_FAILURE")).toBeDefined();
  });
});

describe("detectRisks -- never invents a psychological cause", () => {
  it("every recommendedResponse is an evidence-based action, never a diagnosis of the student", () => {
    const risks = detectRisks(
      baseInput({
        gaps: [{ capabilityCode: "cap.a", requiredLevel: 90, currentLevel: 30, gap: 60, weight: 0.3, minEvidence: 3, evidenceCount: 5, evidenceSufficient: true, severity: 18 }],
      })
    );
    for (const r of risks) {
      expect(r.recommendedResponse.toLowerCase()).not.toMatch(/lazy|unmotivated|anxious|struggling emotionally/);
    }
  });
});
