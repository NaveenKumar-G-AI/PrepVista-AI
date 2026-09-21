import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeConfidence } from "../../src/lib/growth/engine/confidence.ts";
import { ev, daysAgoIso } from "../fixtures/evidenceFactory.ts";

const NOW = new Date("2026-08-20T00:00:00Z");

describe("computeConfidence", () => {
  test("no evidence => INSUFFICIENT", () => {
    const result = computeConfidence([], NOW);
    assert.equal(result.level, "INSUFFICIENT");
    assert.equal(result.score, 0);
  });

  test("diverse repeated success scores higher confidence than the same count from one family", () => {
    const diverse = [
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(4, NOW), outcome: "SUCCESS", challengeFamily: "b" }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
    ];
    const sameFamily = [
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", challengeFamily: "x" }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(4, NOW), outcome: "SUCCESS", challengeFamily: "x" }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS", challengeFamily: "x" }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS", challengeFamily: "x" }),
    ];
    const diverseResult = computeConfidence(diverse, NOW);
    const sameFamilyResult = computeConfidence(sameFamily, NOW);
    assert.ok(diverseResult.score > sameFamilyResult.score, `expected ${diverseResult.score} > ${sameFamilyResult.score}`);
  });

  test("stale evidence (all >45 days old) scores lower than equally-sized recent evidence", () => {
    const stale = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(90, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(80, NOW), outcome: "SUCCESS", challengeFamily: "b" }),
    ];
    const recent = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS", challengeFamily: "b" }),
    ];
    assert.ok(computeConfidence(recent, NOW).score > computeConfidence(stale, NOW).score);
  });

  test("inconsistent outcomes (high variance) score lower than consistent outcomes at the same count", () => {
    const consistent = [
      ev({ dimension: "correctness", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(4, NOW), outcome: "SUCCESS", challengeFamily: "b" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
    ];
    const inconsistent = [
      ev({ dimension: "correctness", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(4, NOW), outcome: "FAILURE", challengeFamily: "b" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(2, NOW), outcome: "FAILURE", challengeFamily: "d" }),
    ];
    assert.ok(computeConfidence(consistent, NOW).score > computeConfidence(inconsistent, NOW).score);
  });

  test("low upstream source confidence caps the resulting growth-confidence even with lots of evidence", () => {
    const lowSourceConfidence = Array.from({ length: 8 }, (_, i) =>
      ev({ dimension: "understanding", occurredAt: daysAgoIso(i + 1, NOW), outcome: "SUCCESS", challengeFamily: `f${i}`, sourceConfidence: 0.2 }),
    );
    const result = computeConfidence(lowSourceConfidence, NOW);
    assert.notEqual(result.level, "HIGH");
  });
});
