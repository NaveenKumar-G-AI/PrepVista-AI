import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideNextBestAction } from "../../src/domain/nextBestActionEngine.js";
import { emptyEvidence, type Diagnosis, type GraphReadiness, type StuckSignal } from "../../src/domain/types.js";

const readyReadiness: GraphReadiness = { isReady: true, blockingPrerequisiteId: null };
const notStuck: StuckSignal = { isStuck: false, signalType: "NONE", evidenceRefs: [] };

function diagnosis(primaryGap: Diagnosis["primaryGap"], detail = "detail"): Diagnosis {
  return { primaryGap, detail, evidenceRefs: ["x"] };
}

describe("decideNextBestAction", () => {
  test("unmet prerequisite always wins, regardless of the skill's own diagnosis", () => {
    const readiness: GraphReadiness = { isReady: false, blockingPrerequisiteId: "prereq-skill" };
    const decision = decideNextBestAction({
      skillId: "target-skill",
      diagnosis: diagnosis("NONE"), // even a "mastered" diagnosis shouldn't matter here
      evidence: emptyEvidence("s1", "target-skill"),
      readiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(decision.targetSkillId, "prereq-skill");
    assert.equal(decision.actionType, "LEARN");
  });

  test("stuck signal overrides the diagnosed gap and assigns an escalating intervention", () => {
    const decision = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("APPLICATION"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: { isStuck: true, signalType: "REPEATED_FAILURE", evidenceRefs: ["3 consecutive incorrect"] },
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(decision.actionType, "DRILL");
    assert.equal(decision.interventionType, "CONCEPT_REBUILD");
  });

  test("FOUNDATION gap with zero attempts -> LEARN; with some attempts -> RELEARN", () => {
    const zeroAttempts = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("FOUNDATION"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(zeroAttempts.actionType, "LEARN");

    const someAttempts = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("FOUNDATION"),
      evidence: { ...emptyEvidence("s1", "sk1"), foundation: { accuracy: 0.2, attempts: 2, avgResponseTimeMs: null, lastAssessedAt: null } },
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(someAttempts.actionType, "RELEARN");
  });

  test("APPLICATION gap -> PRACTICE", () => {
    const decision = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("APPLICATION"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(decision.actionType, "PRACTICE");
  });

  test("SPEED gap -> SPEED_TRAIN", () => {
    const decision = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("SPEED"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(decision.actionType, "SPEED_TRAIN");
  });

  test("STALE gap -> REVIEW (not a full RELEARN)", () => {
    const decision = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("STALE"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(decision.actionType, "REVIEW");
  });

  test("MISCONCEPTION gap -> RELEARN with CONCEPT_REBUILD intervention", () => {
    const decision = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("MISCONCEPTION"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(decision.actionType, "RELEARN");
    assert.equal(decision.interventionType, "CONCEPT_REBUILD");
  });

  test("NONE gap -> ADVANCE when there's an unexplored downstream skill, REST otherwise", () => {
    const advance = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("NONE"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    assert.equal(advance.actionType, "ADVANCE");

    const rest = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("NONE"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: notStuck,
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: false,
    });
    assert.equal(rest.actionType, "REST");
  });

  test("stuck escalation moves to the next step in the sequence on a second stuck episode for the same skill", () => {
    const first = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("APPLICATION"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: { isStuck: true, signalType: "EXCESSIVE_HINTS", evidenceRefs: [] },
      priorInterventionsForSkill: [],
      hasUnexploredDownstream: true,
    });
    const second = decideNextBestAction({
      skillId: "sk1",
      diagnosis: diagnosis("APPLICATION"),
      evidence: emptyEvidence("s1", "sk1"),
      readiness: readyReadiness,
      stuck: { isStuck: true, signalType: "EXCESSIVE_HINTS", evidenceRefs: [] },
      priorInterventionsForSkill: [
        { id: "i1", studentId: "s1", skillId: "sk1", type: first.interventionType!, reason: "x", sequenceIndex: 0, createdAt: new Date().toISOString(), outcomeImproved: false },
      ],
      hasUnexploredDownstream: true,
    });
    assert.notEqual(second.interventionType, first.interventionType, "must not randomly cycle — must move forward");
  });
});
