import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectStuck, type AttemptSignal } from "../../src/domain/stuckDetection.js";

function attempt(correct: boolean, opts: Partial<AttemptSignal> = {}): AttemptSignal {
  return { correct, hintUsed: false, errorSignature: null, timeMs: 20000, expectedTimeMs: 20000, createdAt: new Date().toISOString(), ...opts };
}

describe("detectStuck", () => {
  test("no attempts -> not stuck", () => {
    const s = detectStuck([], 0);
    assert.equal(s.isStuck, false);
  });

  test("3+ consecutive failures -> REPEATED_FAILURE", () => {
    const s = detectStuck([attempt(true), attempt(false), attempt(false), attempt(false)], 0);
    assert.equal(s.isStuck, true);
    assert.equal(s.signalType, "REPEATED_FAILURE");
  });

  test("an isolated failure surrounded by successes is not stuck", () => {
    const s = detectStuck([attempt(true), attempt(false), attempt(true), attempt(true)], 0);
    assert.equal(s.isStuck, false);
  });

  test("same error signature repeated 3x -> REPEATED_SAME_ERROR, even with some correct attempts mixed in", () => {
    const s = detectStuck(
      [attempt(false, { errorSignature: "sign_error" }), attempt(true), attempt(false, { errorSignature: "sign_error" }), attempt(false, { errorSignature: "sign_error" })],
      0
    );
    assert.equal(s.isStuck, true);
    assert.equal(s.signalType, "REPEATED_SAME_ERROR");
  });

  test("excessive hint usage -> EXCESSIVE_HINTS", () => {
    const s = detectStuck([attempt(true, { hintUsed: true }), attempt(true, { hintUsed: true }), attempt(true, { hintUsed: true })], 0);
    assert.equal(s.isStuck, true);
    assert.equal(s.signalType, "EXCESSIVE_HINTS");
  });

  test("repeated abandonment with no other bad signal -> REPEATED_ABANDONMENT", () => {
    const s = detectStuck([attempt(true), attempt(true)], 2);
    assert.equal(s.isStuck, true);
    assert.equal(s.signalType, "REPEATED_ABANDONMENT");
  });

  test("only checks the trailing window, not the entire history", () => {
    const oldFailures = Array(5).fill(0).map(() => attempt(false));
    const recentSuccesses = Array(5).fill(0).map(() => attempt(true));
    const s = detectStuck([...oldFailures, ...recentSuccesses], 0);
    assert.equal(s.isStuck, false);
  });
});
