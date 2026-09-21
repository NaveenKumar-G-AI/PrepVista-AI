import { describe, it, expect } from "vitest";
import { computeGaps, topGap } from "../src/engine/gapAnalysis.js";
import { identifyBottleneck } from "../src/engine/bottleneck.js";
import type { Capability, StudentCapabilityState, TargetRequirement } from "../src/domain/types.js";

const requirements: TargetRequirement[] = [
  { targetId: "t1", capabilityCode: "cap.a", requiredLevel: 80, weight: 0.6, minEvidence: 3 },
  { targetId: "t1", capabilityCode: "cap.b", requiredLevel: 80, weight: 0.4, minEvidence: 3 },
];

const capabilities: Capability[] = [
  { code: "cap.a", name: "Capability A", category: "x" },
  { code: "cap.b", name: "Capability B", category: "x" },
];

describe("gapAnalysis", () => {
  it("treats an untouched capability as a full gap starting from zero", () => {
    const gaps = computeGaps(requirements, []);
    expect(gaps.find((g) => g.capabilityCode === "cap.a")?.currentLevel).toBe(0);
    expect(gaps.find((g) => g.capabilityCode === "cap.a")?.gap).toBe(80);
  });

  it("ranks gaps by severity (gap size weighted by target importance), not raw gap size", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 40, accuracy: 40, speed: 40, transfer: 40, consistency: 40, evidenceCount: 5, lastEvidenceAt: null },
      { studentId: "s1", capabilityCode: "cap.b", level: 41, accuracy: 41, speed: 41, transfer: 41, consistency: 41, evidenceCount: 5, lastEvidenceAt: null },
    ];
    const gaps = computeGaps(requirements, states);
    // cap.a gap=40*0.6=24 severity, cap.b gap=39*0.4=15.6 severity -- cap.a should rank first
    expect(gaps[0].capabilityCode).toBe("cap.a");
  });

  it("topGap ignores negligible (<0.5) gaps", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 79.8, accuracy: 79.8, speed: 79.8, transfer: 79.8, consistency: 79.8, evidenceCount: 5, lastEvidenceAt: null },
      { studentId: "s1", capabilityCode: "cap.b", level: 79.8, accuracy: 79.8, speed: 79.8, transfer: 79.8, consistency: 79.8, evidenceCount: 5, lastEvidenceAt: null },
    ];
    const gaps = computeGaps(requirements, states);
    expect(topGap(gaps)).toBeNull();
  });
});

describe("identifyBottleneck", () => {
  it("returns null when no gap has sufficient evidence -- never fabricates a bottleneck (Section 53)", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 20, accuracy: 20, speed: 20, transfer: 20, consistency: 20, evidenceCount: 1, lastEvidenceAt: null },
    ];
    const { bottleneck } = identifyBottleneck(requirements, states, capabilities);
    expect(bottleneck).toBeNull();
  });

  it("identifies which of the four dimensions is dragging the top-gap capability down", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 60, accuracy: 90, speed: 30, transfer: 90, consistency: 90, evidenceCount: 5, lastEvidenceAt: null },
      { studentId: "s1", capabilityCode: "cap.b", level: 90, accuracy: 90, speed: 90, transfer: 90, consistency: 90, evidenceCount: 5, lastEvidenceAt: null },
    ];
    const { bottleneck } = identifyBottleneck(requirements, states, capabilities);
    expect(bottleneck?.capabilityCode).toBe("cap.a");
    expect(bottleneck?.dimension).toBe("speed");
    expect(bottleneck?.explanation.length).toBeGreaterThan(0);
  });
});
