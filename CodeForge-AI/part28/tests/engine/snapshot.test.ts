import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildGrowthSnapshot } from "../../src/lib/growth/engine/snapshot.ts";
import { RULES_VERSION, GROWTH_ENGINE_VERSION } from "../../src/lib/growth/config.ts";
import { ev, daysAgoIso } from "../fixtures/evidenceFactory.ts";

const NOW = new Date("2026-08-20T00:00:00Z");

function baseEvidence() {
  return [
    ...Array.from({ length: 4 }, (_, i) => ev({ dimension: "correctness", occurredAt: daysAgoIso(50 - i, NOW), outcome: "SUCCESS", challengeFamily: `c${i}` })),
    // debugging: strong baseline, then a real recent decline with enough
    // recent evidence to clear the regression bar (3+).
    ev({ dimension: "debugging", occurredAt: daysAgoIso(60, NOW), outcome: "SUCCESS", challengeFamily: "d0" }),
    ev({ dimension: "debugging", occurredAt: daysAgoIso(55, NOW), outcome: "SUCCESS", challengeFamily: "d1" }),
    ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "FAILURE", challengeFamily: "d2" }),
    ev({ dimension: "debugging", occurredAt: daysAgoIso(5, NOW), outcome: "FAILURE", challengeFamily: "d3" }),
    ev({ dimension: "debugging", occurredAt: daysAgoIso(2, NOW), outcome: "FAILURE", challengeFamily: "d4" }),
  ];
}

describe("buildGrowthSnapshot", () => {
  test("role profile restricts which dimensions are evaluated", () => {
    const snapshot = buildGrowthSnapshot({
      snapshotId: "s1",
      studentId: "student_1",
      allEvidence: baseEvidence(),
      window: { preset: "ALL_TIME", startsAt: null, endsAt: NOW.toISOString() },
      roleProfile: { roleId: "backend", primaryDimensions: ["correctness"] },
      studentModelVersion: "v1",
      skillModelVersion: "v1",
      now: NOW,
    });
    assert.deepEqual(snapshot.dimensions.map((d) => d.dimension), ["correctness"]);
  });

  test("a real regression in one dimension surfaces at the overall level, not diluted by unrelated dimensions", () => {
    const snapshot = buildGrowthSnapshot({
      snapshotId: "s2",
      studentId: "student_1",
      allEvidence: baseEvidence(),
      window: { preset: "ALL_TIME", startsAt: null, endsAt: NOW.toISOString() },
      roleProfile: null,
      studentModelVersion: "v1",
      skillModelVersion: "v1",
      now: NOW,
    });
    const debugging = snapshot.dimensions.find((d) => d.dimension === "debugging")!;
    assert.equal(debugging.state, "REGRESSING");
    assert.equal(snapshot.overallState, "REGRESSING");
  });

  test("snapshots stamp the current engine/rules versions", () => {
    const snapshot = buildGrowthSnapshot({
      snapshotId: "s3",
      studentId: "student_1",
      allEvidence: baseEvidence(),
      window: { preset: "ALL_TIME", startsAt: null, endsAt: NOW.toISOString() },
      roleProfile: null,
      studentModelVersion: "v1",
      skillModelVersion: "v1",
      now: NOW,
    });
    assert.equal(snapshot.rulesVersion, RULES_VERSION);
    assert.equal(snapshot.growthEngineVersion, GROWTH_ENGINE_VERSION);
  });

  test("identical inputs (including a fixed snapshotId and `now`) reproduce an identical snapshot", () => {
    const input = {
      snapshotId: "s4",
      studentId: "student_1",
      allEvidence: baseEvidence(),
      window: { preset: "ALL_TIME" as const, startsAt: null, endsAt: NOW.toISOString() },
      roleProfile: null,
      studentModelVersion: "v1",
      skillModelVersion: "v1",
      now: NOW,
    };
    assert.deepEqual(buildGrowthSnapshot(input), buildGrowthSnapshot(input));
  });

  test("activity is reported independently of growth state — high activity does not imply improvement", () => {
    const manyFlatEvents = Array.from({ length: 10 }, (_, i) =>
      ev({ dimension: "reasoning", occurredAt: daysAgoIso(i, NOW), outcome: i % 2 === 0 ? "SUCCESS" : "FAILURE", challengeFamily: `r${i}` }),
    );
    const snapshot = buildGrowthSnapshot({
      snapshotId: "s5",
      studentId: "student_1",
      allEvidence: manyFlatEvents,
      window: { preset: "ALL_TIME", startsAt: null, endsAt: NOW.toISOString() },
      roleProfile: { roleId: "r", primaryDimensions: ["reasoning"] },
      studentModelVersion: "v1",
      skillModelVersion: "v1",
      now: NOW,
    });
    assert.equal(snapshot.activityLevel, "HIGH");
    assert.notEqual(snapshot.dimensions[0]!.state, "IMPROVING");
  });
});
