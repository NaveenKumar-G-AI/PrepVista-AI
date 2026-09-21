import { describe, expect, it } from "vitest";
import { computeReadinessSnapshot } from "../readinessEngine.js";
import { makeAttempt, makeSimulation } from "./fixtures.js";

const asOf = new Date("2026-02-01T00:00:00.000Z");

describe("computeReadinessSnapshot — evidence gating (Section 2, 63 edge cases)", () => {
  it("returns INSUFFICIENT_EVIDENCE with zero simulations", () => {
    const snapshot = computeReadinessSnapshot({
      studentId: "s1", profileId: null, simulations: [], conceptMasteryHint: null, previousSnapshot: null, asOf,
    });
    expect(snapshot.overallState).toBe("INSUFFICIENT_EVIDENCE");
    expect(snapshot.evidenceCount).toBe(0);
  });

  it("returns EARLY_EVIDENCE after exactly one realistic simulation, even with a perfect score", () => {
    const attempts = Array.from({ length: 20 }, (_, i) => makeAttempt({ sequencePosition: i + 1, isCorrect: true }));
    const sims = [
      makeSimulation({
        practiceMode: "realistic_simulation", status: "submitted", accuracy: 1, attempts,
        submittedAt: "2026-01-31T00:00:00.000Z",
      }),
    ];
    const snapshot = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: sims, conceptMasteryHint: null, previousSnapshot: null, asOf });
    // Section 2: never READY merely because a score exceeds a threshold —
    // one simulation is EARLY_EVIDENCE regardless of how high the score is.
    expect(snapshot.overallState).toBe("EARLY_EVIDENCE");
  });

  it("does not certify STRONGLY_READY from three simulations even with perfect scores (needs 4+)", () => {
    const sims = [1, 2, 3].map((n) =>
      makeSimulation({
        practiceMode: "realistic_simulation",
        status: "submitted",
        accuracy: 1,
        submittedAt: `2026-01-${10 + n}T00:00:00.000Z`,
        attempts: Array.from({ length: 20 }, (_, i) => makeAttempt({ sequencePosition: i + 1, isCorrect: true })),
      })
    );
    const snapshot = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: sims, conceptMasteryHint: null, previousSnapshot: null, asOf });
    expect(snapshot.overallState).not.toBe("STRONGLY_READY");
  });

  it("ignores abandoned simulations as evidence", () => {
    const sims = [
      makeSimulation({ practiceMode: "realistic_simulation", status: "abandoned", attempts: [makeAttempt()] }),
    ];
    const snapshot = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: sims, conceptMasteryHint: null, previousSnapshot: null, asOf });
    expect(snapshot.evidenceCount).toBe(0);
    expect(snapshot.overallState).toBe("INSUFFICIENT_EVIDENCE");
  });
});

describe("computeReadinessSnapshot — gap map", () => {
  it("produces a gap entry for a clearly weak dimension and none for a strong one", () => {
    // Consistently poor accuracy across several realistic simulations.
    const sims = Array.from({ length: 4 }, (_, n) =>
      makeSimulation({
        practiceMode: "realistic_simulation",
        status: "submitted",
        accuracy: 0.3,
        submittedAt: `2026-01-${10 + n}T00:00:00.000Z`,
        attempts: Array.from({ length: 20 }, (_, i) => makeAttempt({ sequencePosition: i + 1, isCorrect: i < 6 })),
      })
    );
    const snapshot = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: sims, conceptMasteryHint: null, previousSnapshot: null, asOf });
    const accuracyGap = snapshot.gaps.find((g) => g.dimensionKey === "accuracy");
    expect(accuracyGap).toBeDefined();
    expect(accuracyGap!.severity).toBe("HIGH_RISK");
  });

  it("sorts gaps with HIGH_RISK before DEVELOPING", () => {
    const sims = Array.from({ length: 4 }, (_, n) =>
      makeSimulation({
        practiceMode: "realistic_simulation",
        status: "submitted",
        accuracy: 0.55,
        submittedAt: `2026-01-${10 + n}T00:00:00.000Z`,
        attempts: Array.from({ length: 20 }, (_, i) => makeAttempt({ sequencePosition: i + 1, isCorrect: i < 11 })),
      })
    );
    const snapshot = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: sims, conceptMasteryHint: null, previousSnapshot: null, asOf });
    const severities = snapshot.gaps.map((g) => g.severity);
    const firstDeveloping = severities.indexOf("DEVELOPING");
    const lastHighRisk = severities.lastIndexOf("HIGH_RISK");
    if (firstDeveloping !== -1 && lastHighRisk !== -1) {
      expect(lastHighRisk).toBeLessThan(firstDeveloping);
    }
  });
});

describe("computeReadinessSnapshot — contributors (Section 24)", () => {
  it("reports a positive contributor when a dimension improves between snapshots", () => {
    const weakAttempts = Array.from({ length: 20 }, (_, i) => makeAttempt({ sequencePosition: i + 1, isCorrect: i < 6 })); // 30%
    const strongAttempts = Array.from({ length: 20 }, (_, i) => makeAttempt({ sequencePosition: i + 1, isCorrect: i < 18 })); // 90%

    const firstSim = [
      makeSimulation({ practiceMode: "realistic_simulation", status: "submitted", accuracy: 0.3, submittedAt: "2026-01-01T00:00:00.000Z", attempts: weakAttempts }),
    ];
    const previous = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: firstSim, conceptMasteryHint: null, previousSnapshot: null, asOf: new Date("2026-01-01T00:00:00.000Z") });

    const bothSims = [
      ...firstSim,
      makeSimulation({ practiceMode: "realistic_simulation", status: "submitted", accuracy: 0.9, submittedAt: "2026-01-15T00:00:00.000Z", attempts: strongAttempts }),
    ];
    const next = computeReadinessSnapshot({
      studentId: "s1", profileId: null, simulations: bothSims, conceptMasteryHint: null,
      previousSnapshot: { snapshotId: previous.id, dimensions: previous.dimensions },
      asOf: new Date("2026-01-15T00:00:00.000Z"),
    });

    const accuracyContributor = next.contributors.find((c) => c.dimensionKey === "accuracy");
    expect(accuracyContributor).toBeDefined();
    expect(accuracyContributor!.direction).toBe("up");
    expect(accuracyContributor!.delta).toBeGreaterThan(0);
  });

  it("produces no contributors when there is no previous snapshot", () => {
    const sims = [makeSimulation({ practiceMode: "realistic_simulation", status: "submitted", accuracy: 0.7, attempts: [makeAttempt()] })];
    const snapshot = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: sims, conceptMasteryHint: null, previousSnapshot: null, asOf });
    expect(snapshot.contributors).toHaveLength(0);
  });
});

describe("computeReadinessSnapshot — dimension-level evidence gating", () => {
  it("never marks a dimension READY on LOW confidence, regardless of score", () => {
    // Exactly one realistic simulation with a perfect score — score is high
    // but sample size is thin, so confidence should be capped and no
    // dimension should present as fully READY off the back of it alone.
    const sims = [
      makeSimulation({
        practiceMode: "realistic_simulation", status: "submitted", accuracy: 1,
        submittedAt: "2026-01-31T00:00:00.000Z",
        attempts: Array.from({ length: 20 }, (_, i) => makeAttempt({ sequencePosition: i + 1, isCorrect: true })),
      }),
    ];
    const snapshot = computeReadinessSnapshot({ studentId: "s1", profileId: null, simulations: sims, conceptMasteryHint: null, previousSnapshot: null, asOf });
    for (const dim of snapshot.dimensions) {
      if (dim.status === "READY") {
        expect(dim.confidence).not.toBe("LOW");
      }
    }
  });
});
