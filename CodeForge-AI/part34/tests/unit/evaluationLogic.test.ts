import { describe, expect, it } from "vitest";
import { classifyConsistency, isEligibleForConsistencyCheck } from "../../src/engine/evaluation/consistency.js";
import { deriveAdaptiveSignal } from "../../src/engine/evaluation/adaptiveSignal.js";
import { deriveEvidenceState } from "../../src/engine/evaluation/evidenceState.js";
import { CONSISTENCY_CLASSES } from "../../src/domain/types.js";

describe("classifyConsistency — never produces an accusation (Phase 14)", () => {
  it("only ever returns one of the four defined, non-accusatory classes", () => {
    const cases = [
      { verifiedCodeFacts: ["fact"], studentExplanation: "a reasonably detailed explanation here", aiFlaggedConsistency: "CONSISTENT" as const },
      { verifiedCodeFacts: ["fact"], studentExplanation: "a reasonably detailed explanation here", aiFlaggedConsistency: "POTENTIAL_INCONSISTENCY" as const },
      { verifiedCodeFacts: [], studentExplanation: "", aiFlaggedConsistency: undefined },
    ];
    for (const c of cases) {
      const result = classifyConsistency(c);
      expect(CONSISTENCY_CLASSES).toContain(result);
    }
  });

  it("returns UNCERTAIN when there is no AI signal and no verified facts to compare against", () => {
    const result = classifyConsistency({ verifiedCodeFacts: [], studentExplanation: "something", aiFlaggedConsistency: undefined });
    expect(result).toBe("UNCERTAIN");
  });

  it("downgrades a near-empty explanation to UNCERTAIN even if the AI flagged a stronger signal", () => {
    const result = classifyConsistency({ verifiedCodeFacts: ["fact"], studentExplanation: "no", aiFlaggedConsistency: "POTENTIAL_INCONSISTENCY" });
    expect(result).toBe("UNCERTAIN");
  });

  it("passes through the AI's classification when the explanation is substantive", () => {
    const result = classifyConsistency({
      verifiedCodeFacts: ["fact"],
      studentExplanation: "a full, substantive explanation of the implementation choices made here",
      aiFlaggedConsistency: "PARTIALLY_CONSISTENT",
    });
    expect(result).toBe("PARTIALLY_CONSISTENT");
  });
});

describe("isEligibleForConsistencyCheck — 'I don't know' is absence of evidence, not inconsistency (Phase 27)", () => {
  it.each(["", "i don't know", "IDK", "not sure", "No idea"])("treats %j as ineligible", (text) => {
    expect(isEligibleForConsistencyCheck(text)).toBe(false);
  });

  it("treats a substantive answer as eligible", () => {
    expect(isEligibleForConsistencyCheck("Because the query pattern repeats per row, I would batch it.")).toBe(true);
  });
});

describe("deriveAdaptiveSignal — Phase 21 branch coverage", () => {
  it("CONTRADICTION takes priority over everything else", () => {
    const signal = deriveAdaptiveSignal({ correctness: "CORRECT", dimensions: { depth: "DEEP" }, consistency: "POTENTIAL_INCONSISTENCY" });
    expect(signal).toBe("CONTRADICTION");
  });

  it("an INSUFFICIENT (including explicit 'I don't know') response is WEAK, not a hard failure state", () => {
    const signal = deriveAdaptiveSignal({ correctness: "INSUFFICIENT", dimensions: {} });
    expect(signal).toBe("WEAK");
  });

  it("INCORRECT is WEAK", () => {
    expect(deriveAdaptiveSignal({ correctness: "INCORRECT", dimensions: {} })).toBe("WEAK");
  });

  it("CORRECT with deep reasoning is STRONG", () => {
    const signal = deriveAdaptiveSignal({ correctness: "CORRECT", dimensions: { depth: "DEEP", reasoningQuality: "STRONG" } });
    expect(signal).toBe("STRONG");
  });

  it("CORRECT with no depth/reasoning signal yet is UNCERTAIN, not automatically STRONG", () => {
    const signal = deriveAdaptiveSignal({ correctness: "CORRECT", dimensions: {} });
    expect(signal).toBe("UNCERTAIN");
  });

  it("PARTIALLY_CORRECT is UNCERTAIN", () => {
    expect(deriveAdaptiveSignal({ correctness: "PARTIALLY_CORRECT", dimensions: {} })).toBe("UNCERTAIN");
  });
});

describe("deriveEvidenceState", () => {
  it("a CONTRADICTION signal never resolves to VERIFIED, no matter the confidence", () => {
    expect(deriveEvidenceState(0.99, "CONTRADICTION")).toBe("UNCERTAIN");
  });

  it("high confidence + STRONG signal is VERIFIED", () => {
    expect(deriveEvidenceState(0.8, "STRONG")).toBe("VERIFIED");
  });

  it("moderate confidence is PARTIALLY_VERIFIED even with a STRONG signal", () => {
    expect(deriveEvidenceState(0.5, "STRONG")).toBe("PARTIALLY_VERIFIED");
  });

  it("low confidence is UNCERTAIN", () => {
    expect(deriveEvidenceState(0.1, "WEAK")).toBe("UNCERTAIN");
  });
});
