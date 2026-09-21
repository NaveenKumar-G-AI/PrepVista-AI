import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectDimensionState } from "../../src/lib/growth/engine/stateDetection.ts";
import { ev, daysAgoIso } from "../fixtures/evidenceFactory.ts";

const NOW = new Date("2026-08-20T00:00:00Z");

describe("detectDimensionState — improvement", () => {
  test("baseline weak + recent strong, enough recent evidence => IMPROVING", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(60, NOW), outcome: "FAILURE", challengeFamily: "a" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(55, NOW), outcome: "FAILURE", challengeFamily: "b" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(50, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(7, NOW), outcome: "SUCCESS", challengeFamily: "e" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS", challengeFamily: "f" }),
    ];
    const result = detectDimensionState(evidence, { now: NOW });
    assert.equal(result.state, "IMPROVING");
    assert.equal(result.trend, "POSITIVE");
    assert.ok(result.delta !== null && result.delta > 0.25);
  });

  test("a single isolated success establishes EMERGING, never IMPROVING or STRONG", () => {
    const evidence = [ev({ dimension: "transfer", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS" })];
    const result = detectDimensionState(evidence, { now: NOW });
    assert.equal(result.state, "EMERGING");
  });

  test("a single isolated failure never creates REGRESSING", () => {
    const evidence = [ev({ dimension: "correctness", occurredAt: daysAgoIso(2, NOW), outcome: "FAILURE" })];
    const result = detectDimensionState(evidence, { now: NOW });
    assert.notEqual(result.state, "REGRESSING");
    assert.equal(result.state, "INSUFFICIENT_EVIDENCE");
  });

  test("one recent failure against a strong baseline flags AT_RISK, not REGRESSING (insufficient recent count)", () => {
    const evidence = [
      ev({ dimension: "correctness", occurredAt: daysAgoIso(80, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(70, NOW), outcome: "SUCCESS", challengeFamily: "b" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(60, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(5, NOW), outcome: "FAILURE", challengeFamily: "d" }),
    ];
    const result = detectDimensionState(evidence, { now: NOW });
    assert.equal(result.state, "AT_RISK");
    assert.notEqual(result.state, "REGRESSING");
  });
});

describe("detectDimensionState — regression", () => {
  test("historically strong, multiple recent failures with enough count => REGRESSING", () => {
    const evidence = [
      ev({ dimension: "correctness", occurredAt: daysAgoIso(90, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(80, NOW), outcome: "SUCCESS", challengeFamily: "b" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(70, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(60, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(12, NOW), outcome: "FAILURE", challengeFamily: "e" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(8, NOW), outcome: "FAILURE", challengeFamily: "f" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(3, NOW), outcome: "FAILURE", challengeFamily: "g" }),
    ];
    const result = detectDimensionState(evidence, { now: NOW });
    assert.equal(result.state, "REGRESSING");
    assert.equal(result.trend, "NEGATIVE");
  });
});

describe("detectDimensionState — stagnation", () => {
  test("high recent activity with flat outcomes vs. a non-floor baseline => STAGNATING", () => {
    const evidence = [
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(80, NOW), outcome: "SUCCESS", challengeFamily: "a" }),
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(70, NOW), outcome: "PARTIAL", challengeFamily: "b" }),
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(60, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(20, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(16, NOW), outcome: "PARTIAL", challengeFamily: "e" }),
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(12, NOW), outcome: "SUCCESS", challengeFamily: "f" }),
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(8, NOW), outcome: "PARTIAL", challengeFamily: "g" }),
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(4, NOW), outcome: "SUCCESS", challengeFamily: "h" }),
    ];
    const result = detectDimensionState(evidence, { now: NOW });
    assert.equal(result.state, "STAGNATING");
  });
});

describe("detectDimensionState — recovery", () => {
  test("previous REGRESSING + recent significant improvement => RECOVERING, not plain IMPROVING", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(90, NOW), outcome: "FAILURE", challengeFamily: "a" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(80, NOW), outcome: "FAILURE", challengeFamily: "b" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(70, NOW), outcome: "PARTIAL", challengeFamily: "c" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(6, NOW), outcome: "SUCCESS", challengeFamily: "e" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS", challengeFamily: "f" }),
    ];
    const result = detectDimensionState(evidence, { now: NOW, previousState: "REGRESSING" });
    assert.equal(result.state, "RECOVERING");
  });

  test("identical evidence WITHOUT a prior REGRESSING/AT_RISK state reads as plain IMPROVING", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(90, NOW), outcome: "FAILURE", challengeFamily: "a" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(80, NOW), outcome: "FAILURE", challengeFamily: "b" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(70, NOW), outcome: "PARTIAL", challengeFamily: "c" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(6, NOW), outcome: "SUCCESS", challengeFamily: "e" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS", challengeFamily: "f" }),
    ];
    const result = detectDimensionState(evidence, { now: NOW, previousState: "STABLE" });
    assert.equal(result.state, "IMPROVING");
  });
});

describe("detectDimensionState — missing / absent data", () => {
  test("zero evidence => NO_EVIDENCE, never a negative state", () => {
    const result = detectDimensionState([], { now: NOW });
    assert.equal(result.state, "NO_EVIDENCE");
    assert.notEqual(result.state, "AT_RISK");
    assert.notEqual(result.state, "REGRESSING");
  });
});

describe("detectDimensionState — baseline windows", () => {
  test("no evidence older than the separation gap => no baseline, trend UNKNOWN, state reflects absolute recent level only", () => {
    const evidence = [
      ev({ dimension: "understanding", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS" }),
      ev({ dimension: "understanding", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS" }),
    ];
    const result = detectDimensionState(evidence, { now: NOW });
    assert.equal(result.trend, "UNKNOWN");
    assert.equal(result.baselineState, null);
  });
});

describe("detectDimensionState — reproducibility", () => {
  test("calling twice with identical inputs and a fixed `now` produces an identical result", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(60, NOW), outcome: "FAILURE", challengeFamily: "a" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS", challengeFamily: "b" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", challengeFamily: "c" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(1, NOW), outcome: "SUCCESS", challengeFamily: "d" }),
    ];
    const a = detectDimensionState(evidence, { now: NOW });
    const b = detectDimensionState(evidence, { now: NOW });
    assert.deepEqual(a, b);
  });
});
