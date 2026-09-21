import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildGrowthSnapshot } from "../../src/lib/growth/engine/snapshot.ts";
import { generateInsightsForDimension } from "../../src/lib/growth/engine/insights.ts";
import { ev, daysAgoIso } from "../fixtures/evidenceFactory.ts";

/**
 * Mirrors the build prompt's own "END-TO-END GOLDEN SCENARIO" fixture:
 * strong algorithms/correctness, moderate complexity, weak debugging,
 * no transfer evidence yet — then the student completes debugging work
 * and a transfer challenge, and growth should visibly update.
 *
 * One deliberate deviation, called out explicitly rather than silently:
 * the prompt's own false-positive-control rules ("a single successful
 * submission should rarely be enough to declare substantial growth") mean
 * a single new debugging success cannot make debugging read as IMPROVING —
 * so this fixture gives the student three independent debugging successes
 * (still a small, plausible sequence) rather than one. And because
 * debugging's prior state was AT_RISK, the prompt's own "RECOVERY
 * DETECTION" section (weak -> successful debugging -> transfer success is
 * explicitly described there as a recovery trajectory) takes precedence
 * over the golden-scenario section's shorthand "Debugging: IMPROVING"
 * label — this fixture asserts RECOVERING, which is strictly more
 * informative and still reads as positive movement.
 */

const T1 = new Date("2026-08-20T00:00:00Z"); // "now" for the first snapshot
const T2 = new Date("2026-08-27T00:00:00Z"); // one week later, after new evidence

function historicalEvidence() {
  return [
    // Algorithms: strong, sustained, diverse — established well before T1.
    ...["a", "b", "c", "d", "e", "f"].map((fam, i) =>
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(90 - i * 5, T1), outcome: "SUCCESS", challengeFamily: fam, difficulty: "MEDIUM" }),
    ),
    // Correctness: strong, sustained, diverse.
    ...["a", "b", "c", "d", "e", "f"].map((fam, i) =>
      ev({ dimension: "correctness", occurredAt: daysAgoIso(85 - i * 5, T1), outcome: "SUCCESS", challengeFamily: fam }),
    ),
    // Complexity: moderate — mixed outcomes.
    ev({ dimension: "complexity_understanding", occurredAt: daysAgoIso(70, T1), outcome: "SUCCESS", challengeFamily: "cx-a" }),
    ev({ dimension: "complexity_understanding", occurredAt: daysAgoIso(60, T1), outcome: "PARTIAL", challengeFamily: "cx-b" }),
    ev({ dimension: "complexity_understanding", occurredAt: daysAgoIso(50, T1), outcome: "FAILURE", challengeFamily: "cx-c" }),
    // Debugging: weak, high assistance, all well in the past by T2.
    ev({ dimension: "debugging", occurredAt: daysAgoIso(95, T1), outcome: "FAILURE", challengeFamily: "off-by-one", assistanceLevel: "HIGH" }),
    ev({ dimension: "debugging", occurredAt: daysAgoIso(80, T1), outcome: "FAILURE", challengeFamily: "null-ref", assistanceLevel: "HIGH" }),
    // Transfer: nothing yet.
  ];
}

function newEvidenceBetweenT1AndT2() {
  return [
    ev({ dimension: "debugging", occurredAt: daysAgoIso(5, T2), outcome: "SUCCESS", challengeFamily: "off-by-one-variant", assistanceLevel: "LOW", context: { note: "root cause identified independently" } }),
    ev({ dimension: "debugging", occurredAt: daysAgoIso(3, T2), outcome: "SUCCESS", challengeFamily: "race-condition", assistanceLevel: "NONE" }),
    ev({ dimension: "debugging", occurredAt: daysAgoIso(1, T2), outcome: "SUCCESS", challengeFamily: "memory-leak", assistanceLevel: "NONE" }),
    ev({ dimension: "transfer", occurredAt: daysAgoIso(1, T2), outcome: "SUCCESS", challengeFamily: "transfer-1", assistanceLevel: "LOW", isTransfer: true }),
  ];
}

describe("golden scenario — T1 baseline snapshot", () => {
  const snapshotT1 = buildGrowthSnapshot({
    snapshotId: "golden_t1",
    studentId: "golden_student",
    allEvidence: historicalEvidence(),
    window: { preset: "ALL_TIME", startsAt: null, endsAt: T1.toISOString() },
    roleProfile: null,
    studentModelVersion: "v1",
    skillModelVersion: "v1",
    now: T1,
  });
  const byDim = Object.fromEntries(snapshotT1.dimensions.map((d) => [d.dimension, d]));

  test("algorithms and correctness read as strong/stable, not merely 'active'", () => {
    assert.ok(["STRONG", "STABLE"].includes(byDim.algorithmic_thinking!.state));
    assert.ok(["STRONG", "STABLE"].includes(byDim.correctness!.state));
  });

  test("debugging reads as a concern (AT_RISK) — matches the prompt's 'weak' description", () => {
    assert.equal(byDim.debugging!.state, "AT_RISK");
  });

  test("transfer has no evidence at all yet", () => {
    assert.ok(!byDim.transfer || byDim.transfer.state === "NO_EVIDENCE");
  });
});

describe("golden scenario — T2 snapshot after debugging + transfer evidence arrives", () => {
  const t1Dims = buildGrowthSnapshot({
    snapshotId: "golden_t1_ref",
    studentId: "golden_student",
    allEvidence: historicalEvidence(),
    window: { preset: "ALL_TIME", startsAt: null, endsAt: T1.toISOString() },
    roleProfile: null,
    studentModelVersion: "v1",
    skillModelVersion: "v1",
    now: T1,
  }).dimensions;
  const previousStates = Object.fromEntries(t1Dims.map((d) => [d.dimension, d.state]));

  const allEvidence = [...historicalEvidence(), ...newEvidenceBetweenT1AndT2()];
  const snapshotT2 = buildGrowthSnapshot({
    snapshotId: "golden_t2",
    studentId: "golden_student",
    allEvidence,
    window: { preset: "ALL_TIME", startsAt: null, endsAt: T2.toISOString() },
    roleProfile: null,
    studentModelVersion: "v1",
    skillModelVersion: "v1",
    now: T2,
    previousDimensionStates: previousStates,
  });
  const byDim = Object.fromEntries(snapshotT2.dimensions.map((d) => [d.dimension, d]));

  test("debugging moves out of AT_RISK into a positive-movement state (RECOVERING)", () => {
    assert.equal(byDim.debugging!.state, "RECOVERING");
    assert.equal(byDim.debugging!.trend, "POSITIVE");
  });

  test("debugging independence trend is POSITIVE — recent successes needed less assistance than the historical failures", () => {
    assert.equal(byDim.debugging!.independenceTrend, "POSITIVE");
  });

  test("transfer moves from no-evidence to EMERGING off a single new success — not further, per false-positive control", () => {
    assert.equal(byDim.transfer!.state, "EMERGING");
  });

  test("every dimension's supporting evidence ids trace back to real fixture evidence ids, never fabricated ones", () => {
    const realIds = new Set(allEvidence.map((e) => e.evidenceId));
    for (const dim of snapshotT2.dimensions) {
      for (const id of dim.supportingEvidenceIds) {
        assert.ok(realIds.has(id), `evidence id ${id} for ${dim.dimension} is not a real fixture id`);
      }
    }
  });

  test("insight generation produces a RECOVERY insight and an INDEPENDENCE_GAIN insight for debugging, each citing real evidence", () => {
    const insights = generateInsightsForDimension("golden_student", byDim.debugging!, T2);
    const types = insights.map((i) => i.insightType);
    assert.ok(types.includes("RECOVERY"), `expected RECOVERY, got: ${types.join(", ")}`);
    assert.ok(types.includes("INDEPENDENCE_GAIN"), `expected INDEPENDENCE_GAIN, got: ${types.join(", ")}`);
    const realIds = new Set(allEvidence.map((e) => e.evidenceId));
    for (const insight of insights) {
      for (const ref of insight.evidenceRefs) assert.ok(realIds.has(ref));
    }
  });

  test("algorithms and correctness are undisturbed by unrelated debugging/transfer movement", () => {
    assert.ok(["STRONG", "STABLE"].includes(byDim.algorithmic_thinking!.state));
    assert.ok(["STRONG", "STABLE"].includes(byDim.correctness!.state));
  });
});
