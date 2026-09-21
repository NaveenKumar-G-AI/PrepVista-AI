import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { recommendNextDifficulty, type RecentAttempt } from "../../src/domain/difficultyEngine.js";

describe("recommendNextDifficulty", () => {
  test("Phase 13 — repeated high accuracy at current tier increases difficulty", () => {
    const attempts: RecentAttempt[] = [
      { correct: true, difficulty: "FOUNDATION" },
      { correct: true, difficulty: "FOUNDATION" },
      { correct: true, difficulty: "FOUNDATION" },
      { correct: true, difficulty: "FOUNDATION" },
    ];
    const rec = recommendNextDifficulty("FOUNDATION", attempts);
    assert.equal(rec.changed, "INCREASED");
    assert.equal(rec.nextDifficulty, "BEGINNER");
    assert.ok(rec.message);
  });

  test("does not keep escalating past CHALLENGE (ladder ceiling)", () => {
    const attempts: RecentAttempt[] = Array(5).fill({ correct: true, difficulty: "CHALLENGE" });
    const rec = recommendNextDifficulty("CHALLENGE", attempts);
    assert.equal(rec.nextDifficulty, "CHALLENGE");
    assert.equal(rec.changed, "UNCHANGED"); // already at ceiling, step() clamps
  });

  test("Phase 14 — failing at a harder tier steps back one tier, and is flagged as tier-local only", () => {
    const attempts: RecentAttempt[] = [
      { correct: false, difficulty: "ADVANCED" },
      { correct: false, difficulty: "ADVANCED" },
      { correct: true, difficulty: "ADVANCED" },
    ];
    const rec = recommendNextDifficulty("ADVANCED", attempts);
    assert.equal(rec.changed, "DECREASED");
    assert.equal(rec.nextDifficulty, "INTERMEDIATE");
    assert.equal(rec.isHardTierFailureOnly, true, "must be flagged so the caller never downgrades foundation-level evidence from this alone");
  });

  test("mixing attempts from a different tier does not count toward the current tier's accuracy", () => {
    // 5 failing FOUNDATION attempts sitting alongside 3 recent, all-correct
    // ADVANCED attempts must not trigger the easy-trap increase off FOUNDATION.
    const attempts: RecentAttempt[] = [
      { correct: false, difficulty: "FOUNDATION" },
      { correct: false, difficulty: "FOUNDATION" },
      { correct: true, difficulty: "ADVANCED" },
      { correct: true, difficulty: "ADVANCED" },
      { correct: true, difficulty: "ADVANCED" },
    ];
    const rec = recommendNextDifficulty("FOUNDATION", attempts);
    assert.notEqual(rec.changed, "INCREASED");
  });

  test("mixed results at current tier with no threshold crossed leaves difficulty unchanged", () => {
    const attempts: RecentAttempt[] = [
      { correct: true, difficulty: "INTERMEDIATE" },
      { correct: false, difficulty: "INTERMEDIATE" },
      { correct: true, difficulty: "INTERMEDIATE" },
    ];
    const rec = recommendNextDifficulty("INTERMEDIATE", attempts);
    assert.equal(rec.changed, "UNCHANGED");
  });
});
