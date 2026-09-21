import { describe, it, expect } from "vitest";
import { selectMode } from "../src/engine/pathModes.js";
import type { RiskCandidate } from "../src/engine/riskEngine.js";
import type { CapabilityGap } from "../src/engine/gapAnalysis.js";

const risk = (type: RiskCandidate["type"], severity: RiskCandidate["severity"]): RiskCandidate => ({
  type, severity, reason: "test", evidence: {}, recommendedResponse: "test",
});

const gap = (evidenceSufficient: boolean): CapabilityGap => ({
  capabilityCode: "cap.a", requiredLevel: 80, currentLevel: 40, gap: 40, weight: 0.5, minEvidence: 3,
  evidenceCount: evidenceSufficient ? 5 : 1, evidenceSufficient, severity: 20,
});

describe("selectMode", () => {
  it("RECOVERY takes priority over everything else, even under a tight deadline", () => {
    const { mode } = selectMode([risk("REPEATED_FAILURE", "HIGH")], 10, [], 40, 90);
    expect(mode).toBe("RECOVERY");
  });

  it("REASSESSMENT fires when most requirements lack sufficient evidence", () => {
    const { mode } = selectMode([], null, [gap(false), gap(false), gap(true)], 30, 90);
    expect(mode).toBe("REASSESSMENT");
  });

  it("FAST_TRACK fires under a tight deadline with real distance remaining", () => {
    const { mode } = selectMode([], 14, [gap(true)], 60, 90);
    expect(mode).toBe("FAST_TRACK");
  });

  it("DEEP_MASTERY fires with no deadline pressure and the student already close", () => {
    const { mode } = selectMode([], null, [gap(true)], 80, 90);
    expect(mode).toBe("DEEP_MASTERY");
  });

  it("falls back to STANDARD absent any of the above conditions", () => {
    const { mode } = selectMode([], 40, [gap(true)], 60, 90);
    expect(mode).toBe("STANDARD");
  });
});
