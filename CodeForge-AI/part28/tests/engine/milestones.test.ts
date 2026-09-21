import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectMilestones } from "../../src/lib/growth/engine/milestones.ts";
import { ev, daysAgoIso } from "../fixtures/evidenceFactory.ts";

const NOW = new Date("2026-08-20T00:00:00Z");

describe("detectMilestones", () => {
  test("detects first independent success, first transfer success, and first advanced success", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(20, NOW), outcome: "SUCCESS", assistanceLevel: "NONE", difficulty: "EASY" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS", isTransfer: true, difficulty: "MEDIUM" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS", difficulty: "ADVANCED" }),
    ];
    const milestones = detectMilestones("student_1", "debugging", evidence);
    const types = milestones.map((m) => m.milestoneType);
    assert.ok(types.includes("FIRST_INDEPENDENT_SUCCESS"));
    assert.ok(types.includes("FIRST_TRANSFER_SUCCESS"));
    assert.ok(types.includes("FIRST_ADVANCED_SUCCESS"));
  });

  test("debugging recovery milestone requires a failure THEN a later success in the same challenge family", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(20, NOW), outcome: "FAILURE", challengeFamily: "off-by-one", assistanceLevel: "HIGH" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", challengeFamily: "off-by-one", assistanceLevel: "LOW" }),
    ];
    const milestones = detectMilestones("student_1", "debugging", evidence);
    assert.ok(milestones.some((m) => m.milestoneType === "FIRST_DEBUGGING_RECOVERY"));
  });

  test("milestoneKey is deterministic and stable for the same input, enabling dedup on re-scan", () => {
    const evidence = [ev({ dimension: "correctness", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", assistanceLevel: "NONE" })];
    const first = detectMilestones("student_1", "correctness", evidence);
    const second = detectMilestones("student_1", "correctness", evidence);
    assert.deepEqual(
      first.map((m) => m.milestoneKey),
      second.map((m) => m.milestoneKey),
    );
  });

  test("three consecutive successes trigger CONSISTENT_CORRECTNESS", () => {
    const evidence = [
      ev({ dimension: "correctness", occurredAt: daysAgoIso(15, NOW), outcome: "FAILURE" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(7, NOW), outcome: "SUCCESS" }),
      ev({ dimension: "correctness", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS" }),
    ];
    const milestones = detectMilestones("student_1", "correctness", evidence);
    assert.ok(milestones.some((m) => m.milestoneType === "CONSISTENT_CORRECTNESS"));
  });
});
