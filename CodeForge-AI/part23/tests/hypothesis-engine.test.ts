import { describe, it, expect } from "vitest";
import {
  scoreHypothesisHeuristically,
  refinementQuestion,
  createHypothesis,
  canTransitionHypothesis,
  transitionHypothesis,
  wasGoodFaithRejection,
  selectDistinguishingTarget,
} from "../src/domain/hypothesis-engine.js";
import { Hypothesis, HypothesisStatus } from "../src/types.js";

describe("scoreHypothesisHeuristically — Section 11's own weak/strong examples", () => {
  it("scores the doc's 'weak' example lower than its 'stronger' example", () => {
    const weak = scoreHypothesisHeuristically("Something is wrong with the loop.");
    const strong = scoreHypothesisHeuristically("The loop terminates before the final valid element.");
    expect(strong.overall).toBeGreaterThan(weak.overall);
    expect(weak.overall).toBeLessThan(0.45);
  });

  it("scores Section 14's broad hypothesis ('The map is wrong.') as low quality", () => {
    const broad = scoreHypothesisHeuristically("The map is wrong.");
    expect(broad.overall).toBeLessThan(0.4);
  });

  it("rewards evidence connection when the statement references an actual known evidence token", () => {
    const withoutEvidence = scoreHypothesisHeuristically("The value becomes negative before the comparison.");
    const withEvidence = scoreHypothesisHeuristically("The value of left becomes negative before the comparison.", ["left"]);
    expect(withEvidence.evidenceConnection).toBeGreaterThan(withoutEvidence.evidenceConnection);
    expect(withEvidence.overall).toBeGreaterThan(withoutEvidence.overall);
  });

  it("penalizes hedged, unfalsifiable phrasing", () => {
    const hedged = scoreHypothesisHeuristically("Maybe something is somehow off in general.");
    expect(hedged.falsifiability).toBeLessThan(0.4);
  });
});

describe("refinementQuestion", () => {
  it("returns a refinement question for a low-quality hypothesis and does not reveal the answer", () => {
    const q = refinementQuestion(scoreHypothesisHeuristically("Something is wrong with the loop."));
    expect(q).toBeDefined();
    expect(q!.toLowerCase()).not.toMatch(/off by one|boundary|index/); // must not leak the likely answer
  });

  it("returns undefined once a hypothesis is already specific and testable", () => {
    const q = refinementQuestion(scoreHypothesisHeuristically("The loop terminates before the final valid element because the condition uses < instead of <=."));
    expect(q).toBeUndefined();
  });
});

describe("hypothesis lifecycle (Section 12)", () => {
  it("allows PROPOSED -> TESTING -> SUPPORTED", () => {
    expect(canTransitionHypothesis(HypothesisStatus.PROPOSED, HypothesisStatus.TESTING)).toBe(true);
    expect(canTransitionHypothesis(HypothesisStatus.TESTING, HypothesisStatus.SUPPORTED)).toBe(true);
  });

  it("rejects jumping straight from PROPOSED to SUPPORTED (must be tested first)", () => {
    expect(canTransitionHypothesis(HypothesisStatus.PROPOSED, HypothesisStatus.SUPPORTED)).toBe(false);
  });

  it("rejects leaving a terminal state", () => {
    expect(canTransitionHypothesis(HypothesisStatus.SUPPORTED, HypothesisStatus.TESTING)).toBe(false);
    expect(canTransitionHypothesis(HypothesisStatus.REJECTED, HypothesisStatus.TESTING)).toBe(false);
  });

  it("allows INCONCLUSIVE back to TESTING (retry)", () => {
    expect(canTransitionHypothesis(HypothesisStatus.INCONCLUSIVE, HypothesisStatus.TESTING)).toBe(true);
  });

  it("transitionHypothesis throws on an invalid transition and stamps resolvedAt on terminal ones", () => {
    const h = createHypothesis("The loop terminates before the final valid element.");
    expect(() => transitionHypothesis(h, HypothesisStatus.SUPPORTED)).toThrow();

    const testing = transitionHypothesis(h, HypothesisStatus.TESTING);
    expect(testing.resolvedAt).toBeUndefined();
    const rejected = transitionHypothesis(testing, HypothesisStatus.REJECTED, "trace showed left never went out of range");
    expect(rejected.resolvedAt).toBeDefined();
    expect(rejected.resolutionEvidence).toContain("trace showed");
  });
});

describe("wasGoodFaithRejection (Section 11: don't penalize a reasonable but false hypothesis)", () => {
  it("is true for a specific, testable hypothesis that was rejected with real evidence", () => {
    const h: Hypothesis = transitionHypothesis(
      transitionHypothesis(
        createHypothesis("The loop terminates before the final valid element because of a strict comparison."),
        HypothesisStatus.TESTING
      ),
      HypothesisStatus.REJECTED,
      "trace showed the loop runs one extra iteration, not one fewer"
    );
    expect(wasGoodFaithRejection(h)).toBe(true);
  });

  it("is false for a vague hypothesis that was abandoned without evidence", () => {
    const h: Hypothesis = transitionHypothesis(
      transitionHypothesis(createHypothesis("Something is wrong with the loop."), HypothesisStatus.TESTING),
      HypothesisStatus.REJECTED
    );
    expect(wasGoodFaithRejection(h)).toBe(false);
  });
});

describe("selectDistinguishingTarget (Section 13: A/B/C competing causes)", () => {
  it("finds the target shared by the most live hypotheses", () => {
    const hypotheses: Hypothesis[] = [
      { id: "a", statement: "boundary condition", status: HypothesisStatus.TESTING, distinguishingTargets: ["left"], createdAt: "", updatedAt: "" },
      { id: "b", statement: "state update", status: HypothesisStatus.PROPOSED, distinguishingTargets: ["left", "mid"], createdAt: "", updatedAt: "" },
      { id: "c", statement: "input parsing", status: HypothesisStatus.PROPOSED, distinguishingTargets: ["rawInput"], createdAt: "", updatedAt: "" },
    ];
    const result = selectDistinguishingTarget(hypotheses);
    expect(result?.target).toBe("left");
    expect(result?.hypothesisIds.sort()).toEqual(["a", "b"]);
  });

  it("returns undefined when no target is shared by 2+ live hypotheses", () => {
    const hypotheses: Hypothesis[] = [
      { id: "a", statement: "x", status: HypothesisStatus.TESTING, distinguishingTargets: ["left"], createdAt: "", updatedAt: "" },
      { id: "b", statement: "y", status: HypothesisStatus.TESTING, distinguishingTargets: ["mid"], createdAt: "", updatedAt: "" },
    ];
    expect(selectDistinguishingTarget(hypotheses)).toBeUndefined();
  });

  it("ignores hypotheses that are already resolved (not live)", () => {
    const hypotheses: Hypothesis[] = [
      { id: "a", statement: "x", status: HypothesisStatus.REJECTED, distinguishingTargets: ["left"], createdAt: "", updatedAt: "" },
      { id: "b", statement: "y", status: HypothesisStatus.TESTING, distinguishingTargets: ["left"], createdAt: "", updatedAt: "" },
    ];
    expect(selectDistinguishingTarget(hypotheses)).toBeUndefined();
  });
});
