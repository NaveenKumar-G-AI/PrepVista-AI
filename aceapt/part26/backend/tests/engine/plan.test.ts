import { describe, expect, it } from "vitest";
import { seedEvidence } from "../../src/db/seed";
import { computeAllCapabilityStates } from "../../src/engine/state";
import { diagnoseAllTopics } from "../../src/engine/diagnosis";
import { buildCandidateActions } from "../../src/engine/candidateActions";
import { rankCandidates } from "../../src/engine/priority";
import { generatePlan } from "../../src/engine/plan";
import { RawTopicEvidence } from "../../src/types";

function planFor(evidence: RawTopicEvidence[], minutes: number) {
  const states = computeAllCapabilityStates(evidence);
  const diagnoses = diagnoseAllTopics(states);
  const candidates = buildCandidateActions(diagnoses);
  const statesById = new Map(states.map((s) => [s.topicId, s]));
  const ranked = rankCandidates(candidates, statesById);
  return generatePlan({
    studentId: "demo-student",
    totalMinutes: minutes,
    remainingMinutes: minutes,
    rankedCandidates: ranked,
    allStatesById: statesById
  });
}

describe("generatePlan - section 45 Startupthon demo, reproduced exactly", () => {
  // Scoped to just the two topics the document's own demo describes
  // (Percentages + Probability), so this test checks the plan against the
  // document rather than against unrelated topics this build also tracks.
  const demoEvidence = seedEvidence().filter((e) => ["percentages", "probability"].includes(e.topicId));

  it("given 15 minutes, produces exactly: probability repair, percentage transfer, then verification", () => {
    const plan = planFor(demoEvidence, 15);

    expect(plan.items).toHaveLength(3);
    expect(plan.items[0].action.topicId).toBe("probability");
    expect(plan.items[0].action.actionType).toBe("RECALL");
    expect(plan.items[1].action.topicId).toBe("percentages");
    expect(plan.items[1].action.actionType).toBe("TRANSFER_CHALLENGE");
    expect(plan.items[2].action.actionType).toBe("MIX");

    const totalUsed = plan.items.reduce((sum, i) => sum + i.action.estimatedMinutes, 0);
    expect(totalUsed).toBe(15);
    expect(plan.remainingMinutes).toBe(0);
  });

  it("never schedules more minutes than were given, unless a single unmissable priority genuinely needs more (and says so)", () => {
    for (const minutes of [5, 10, 15, 30, 60]) {
      const plan = planFor(demoEvidence, minutes);
      const totalUsed = plan.items.reduce((sum, i) => sum + i.action.estimatedMinutes, 0);
      expect(totalUsed <= minutes || plan.exceedsBudget).toBe(true);
    }
  });

  it("with only 5 minutes, still surfaces the real top priority rather than an unrelated filler, and says it runs over", () => {
    const plan = planFor(demoEvidence, 5);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action.topicId).toBe("probability");
    expect(plan.exceedsBudget).toBe(true);
  });
});

describe("generatePlan - stable-topics fallback (sections 19, 24)", () => {
  it("offers a stretch challenge instead of an empty plan when every topic is stable", () => {
    const stableOnly = seedEvidence().filter((e) => e.topicId === "averages");
    const plan = planFor(stableOnly, 15);
    expect(plan.allStable).toBe(true);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action.actionType).toBe("CHALLENGE");
  });
});

describe("generatePlan - full 8-topic evidence pool (robustness)", () => {
  it("never exceeds the requested budget across a wide range of inputs, unless a single priority legitimately needs more (and flags it)", () => {
    const full = seedEvidence();
    for (const minutes of [5, 15, 30, 60]) {
      const plan = planFor(full, minutes);
      const totalUsed = plan.items.reduce((sum, i) => sum + i.action.estimatedMinutes, 0);
      expect(totalUsed <= minutes || plan.exceedsBudget).toBe(true);
      expect(plan.remainingMinutes).toBeGreaterThanOrEqual(0);
    }
  });

  it("still ranks probability above percentages even with every other topic mixed in", () => {
    const plan = planFor(seedEvidence(), 60);
    const order = plan.items.map((i) => i.action.topicId);
    const probIdx = order.indexOf("probability");
    const pctIdx = order.indexOf("percentages");
    expect(probIdx).toBeGreaterThanOrEqual(0);
    expect(pctIdx).toBeGreaterThanOrEqual(0);
    expect(probIdx).toBeLessThan(pctIdx);
  });
});
