import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computePriority, urgencyFromDeadline } from "../../src/domain/priorityEngine.js";
import { SkillGraph } from "../../src/domain/skillGraph.js";
import type { Diagnosis, Skill, StudentContext } from "../../src/domain/types.js";

function skill(id: string, prerequisiteIds: string[] = [], relevance = 0.7): Skill {
  return { id, name: id, category: "test", prerequisiteIds, baseRelevance: { PLACEMENT_PREP: relevance }, estimatedLearnMinutes: 20 };
}

const gapDiagnosis: Diagnosis = { primaryGap: "FOUNDATION", detail: "x", evidenceRefs: [] };

const baseContext: StudentContext = { studentId: "s1", goal: "PLACEMENT_PREP", availableMinutesPerSession: 30, deadline: null };

describe("urgencyFromDeadline", () => {
  test("no deadline gets a mild non-zero default, not full urgency", () => {
    const u = urgencyFromDeadline(null);
    assert.ok(u > 0 && u < 0.5);
  });
  test("deadline within the urgent window is fully urgent", () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    assert.equal(urgencyFromDeadline(soon), 1);
  });
  test("deadline far in the future is not urgent", () => {
    const far = new Date(Date.now() + 90 * 86_400_000).toISOString();
    assert.equal(urgencyFromDeadline(far), 0);
  });
  test("urgency decreases monotonically as the deadline moves further out", () => {
    const near = urgencyFromDeadline(new Date(Date.now() + 10 * 86_400_000).toISOString());
    const mid = urgencyFromDeadline(new Date(Date.now() + 30 * 86_400_000).toISOString());
    assert.ok(near > mid);
  });
});

describe("computePriority", () => {
  test("a skill blocking more downstream skills scores higher, all else equal", () => {
    const graph = new SkillGraph([skill("root"), skill("leaf-a", ["root"]), skill("leaf-b", ["root"]), skill("leaf-c", ["root"]), skill("isolated")]);
    const rootScore = computePriority(skill("root"), gapDiagnosis, "LEARN", baseContext, graph, false);
    const isolatedScore = computePriority(skill("isolated"), gapDiagnosis, "LEARN", baseContext, graph, false);
    assert.ok(rootScore.score > isolatedScore.score, `root (blocks 3) should outscore isolated (blocks 0): ${rootScore.score} vs ${isolatedScore.score}`);
    assert.ok(rootScore.factors.downstreamImpact > isolatedScore.factors.downstreamImpact);
  });

  test("an urgent deadline raises priority relative to no deadline, all else equal", () => {
    const graph = new SkillGraph([skill("sk1")]);
    const relaxed = computePriority(skill("sk1"), gapDiagnosis, "LEARN", { ...baseContext, deadline: null }, graph, false);
    const urgent = computePriority(skill("sk1"), gapDiagnosis, "LEARN", { ...baseContext, deadline: new Date(Date.now() + 86_400_000).toISOString() }, graph, false);
    assert.ok(urgent.score > relaxed.score);
  });

  test("being the blocking prerequisite for another candidate adds a bonus", () => {
    const graph = new SkillGraph([skill("sk1")]);
    const notBlocking = computePriority(skill("sk1"), gapDiagnosis, "LEARN", baseContext, graph, false);
    const blocking = computePriority(skill("sk1"), gapDiagnosis, "LEARN", baseContext, graph, true);
    assert.ok(blocking.score > notBlocking.score);
  });

  test("a skill fully mastered (NONE gap) scores nothing for gap size", () => {
    const graph = new SkillGraph([skill("sk1")]);
    const masteredDiagnosis: Diagnosis = { primaryGap: "NONE", detail: "x", evidenceRefs: [] };
    const score = computePriority(skill("sk1"), masteredDiagnosis, "ADVANCE", baseContext, graph, false);
    assert.equal(score.factors.gapSize, 0);
  });

  test("SPECIFIC_TARGET goal boosts relevance to 1 for a listed skill even if baseRelevance is low", () => {
    const graph = new SkillGraph([skill("sk1", [], 0.1)]);
    const context: StudentContext = { ...baseContext, goal: "SPECIFIC_TARGET", targetSkillIds: ["sk1"] };
    const score = computePriority(skill("sk1", [], 0.1), gapDiagnosis, "LEARN", context, graph, false);
    assert.equal(score.factors.goalRelevance, 1);
  });
});
