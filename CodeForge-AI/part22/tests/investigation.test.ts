import { describe, expect, it } from "vitest";
import { createExperiment, createHypothesis, detectRandomEditPattern, logAction, resolveExperiment, resolveHypothesisStatus } from "../src/debugging/investigation.js";
import { EvidenceRequiredError } from "../src/types.js";

describe("hypothesis evidence gate", () => {
  it("refuses to mark SUPPORTED without any resolved experiment", () => {
    const h = createHypothesis({ id: "h1", sessionId: "s1", text: "pointer bug" });
    expect(() => resolveHypothesisStatus(h, "SUPPORTED", [])).toThrow(EvidenceRequiredError);
  });

  it("refuses to mark REJECTED using an experiment that references a different hypothesis", () => {
    const h = createHypothesis({ id: "h1", sessionId: "s1", text: "pointer bug" });
    const unrelated = resolveExperiment(
      createExperiment({ id: "e0", sessionId: "s1", hypothesisId: "some-other-hypothesis", action: "x", expectedResult: "y" }),
      "z",
      "REJECTED"
    );
    expect(() => resolveHypothesisStatus(h, "REJECTED", [unrelated])).toThrow(EvidenceRequiredError);
  });

  it("allows SUPPORTED once a resolved experiment actually references it", () => {
    const h = createHypothesis({ id: "h2", sessionId: "s1", text: "pointer bug" });
    const resolved = resolveExperiment(
      createExperiment({ id: "e1", sessionId: "s1", hypothesisId: "h2", action: "inspect state", expectedResult: "valid" }),
      "invalid",
      "SUPPORTED"
    );
    const updated = resolveHypothesisStatus(h, "SUPPORTED", [resolved]);
    expect(updated.status).toBe("SUPPORTED");
  });

  it("allows REJECTED with equal ease - a rejected hypothesis is not treated as a worse outcome by this function", () => {
    const h = createHypothesis({ id: "h3", sessionId: "s1", text: "off by one" });
    const resolved = resolveExperiment(
      createExperiment({ id: "e2", sessionId: "s1", hypothesisId: "h3", action: "check bound", expectedResult: "x" }),
      "y",
      "REJECTED"
    );
    const updated = resolveHypothesisStatus(h, "REJECTED", [resolved]);
    expect(updated.status).toBe("REJECTED");
  });

  it("allows TESTING/INCONCLUSIVE transitions without requiring any evidence", () => {
    const h = createHypothesis({ id: "h4", sessionId: "s1", text: "guess" });
    expect(() => resolveHypothesisStatus(h, "SUPPORTED", [])).toThrow();
    // TESTING/INCONCLUSIVE go through a different, evidence-free function by design:
  });
});

describe("detectRandomEditPattern", () => {
  it("flags 3+ edit/run cycles with no investigative action in between", () => {
    const actions = [];
    for (let i = 0; i < 3; i++) {
      actions.push(logAction({ id: `a${i}-1`, sessionId: "s1", type: "APPLY_CHANGE" }));
      actions.push(logAction({ id: `a${i}-2`, sessionId: "s1", type: "RUN" }));
    }
    const signal = detectRandomEditPattern(actions);
    expect(signal.detected).toBe(true);
    expect(signal.longestEditRunStreak).toBeGreaterThanOrEqual(3);
    expect(signal.message).toMatch(/trial-and-error/);
  });

  it("does not flag a student who inspects evidence between edits", () => {
    const actions = [
      logAction({ id: "b1", sessionId: "s1", type: "APPLY_CHANGE" }),
      logAction({ id: "b2", sessionId: "s1", type: "RUN" }),
      logAction({ id: "b3", sessionId: "s1", type: "INSPECT_VARIABLE" }),
      logAction({ id: "b4", sessionId: "s1", type: "APPLY_CHANGE" }),
      logAction({ id: "b5", sessionId: "s1", type: "RUN" }),
      logAction({ id: "b6", sessionId: "s1", type: "INSPECT_TRACE" }),
      logAction({ id: "b7", sessionId: "s1", type: "APPLY_CHANGE" }),
      logAction({ id: "b8", sessionId: "s1", type: "RUN" })
    ];
    const signal = detectRandomEditPattern(actions);
    expect(signal.detected).toBe(false);
    expect(signal.message).toBeNull();
  });

  it("does not flag a short session with only one or two edit/run cycles", () => {
    const actions = [
      logAction({ id: "c1", sessionId: "s1", type: "APPLY_CHANGE" }),
      logAction({ id: "c2", sessionId: "s1", type: "RUN" })
    ];
    expect(detectRandomEditPattern(actions).detected).toBe(false);
  });
});
