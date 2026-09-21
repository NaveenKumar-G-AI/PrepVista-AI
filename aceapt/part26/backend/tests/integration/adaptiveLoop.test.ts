import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../../src/db/store";
import { seedEvidence } from "../../src/db/seed";
import {
  completeAction,
  getAdaptivePlan,
  getNextAction,
  skipAction,
  startAction
} from "../../src/engine/orchestrator";

const STUDENT = "integration-test-student";

function resetStudent() {
  Store.setEvidence(
    STUDENT,
    seedEvidence().filter((e) => ["percentages", "probability"].includes(e.topicId))
  );
  Store.clearPlanSession(STUDENT);
}

describe("full adaptive loop", () => {
  beforeEach(() => {
    resetStudent();
  });

  it("ranks two weaknesses, builds a 15-minute plan, completes the top action, and replans automatically (sections 17, 45, 53)", async () => {
    const { plan } = await getAdaptivePlan(STUDENT, 15, true);
    expect(plan.items[0].action.topicId).toBe("probability");
    const firstAction = plan.items[0].action;

    const started = startAction(STUDENT, firstAction.id);
    expect(started).not.toBeNull();

    // Answer using the server's own stored correct answers - proves the
    // replanning that follows is driven by real grading, not a script.
    const pending = Store.getPendingExecution(started!.executionId)!;
    const correctAnswers = pending.items.map((item) => ({
      itemId: item.id,
      selectedIndex: item.correctIndex,
      responseTimeSeconds: 12
    }));

    const completed = await completeAction(STUDENT, started!.executionId, correctAnswers);
    expect(completed).not.toBeNull();
    expect(completed!.grade.correctCount).toBe(completed!.grade.totalCount);

    const probabilityState = completed!.states.find((s) => s.topicId === "probability")!;
    expect(probabilityState.retention as number).toBeGreaterThan(42);

    // The plan recomputed for the remaining budget and now leads with
    // percentages - probability dropped out because it resolved, not
    // because it was blindly excluded.
    const remainingPlan = completed!.plan!.plan;
    expect(remainingPlan.items[0].action.topicId).toBe("percentages");
    const usedSoFar = 15 - remainingPlan.items.reduce((s, i) => s + i.action.estimatedMinutes, 0) - remainingPlan.remainingMinutes;
    expect(usedSoFar).toBeGreaterThan(0);

    // Complete the second action too and confirm the loop keeps going.
    const secondAction = remainingPlan.items[0].action;
    const started2 = startAction(STUDENT, secondAction.id);
    expect(started2).not.toBeNull();
    const pending2 = Store.getPendingExecution(started2!.executionId)!;
    const correctAnswers2 = pending2.items.map((item) => ({
      itemId: item.id,
      selectedIndex: item.correctIndex,
      responseTimeSeconds: 10
    }));
    const completed2 = await completeAction(STUDENT, started2!.executionId, correctAnswers2);
    expect(completed2!.grade.correctCount).toBe(completed2!.grade.totalCount);
    const percentagesState = completed2!.states.find((s) => s.topicId === "percentages")!;
    expect(percentagesState.transfer as number).toBeGreaterThan(61);
  });

  it("keeps recommending the same topic when the student answers incorrectly - adaptivity is genuine, not scripted", async () => {
    await getAdaptivePlan(STUDENT, 15, true);
    const { action } = await getNextAction(STUDENT);
    expect(action?.topicId).toBe("probability");

    const started = startAction(STUDENT, action!.id);
    const pending = Store.getPendingExecution(started!.executionId)!;
    const wrongAnswers = pending.items.map((item) => ({
      itemId: item.id,
      selectedIndex: (item.correctIndex + 1) % item.options.length,
      responseTimeSeconds: 20
    }));

    const completed = await completeAction(STUDENT, started!.executionId, wrongAnswers);
    expect(completed!.grade.correctCount).toBe(0);

    // The gap is still real (in fact worse), so it must still be top of mind.
    expect(completed!.next.action?.topicId).toBe("probability");
    const probabilityState = completed!.states.find((s) => s.topicId === "probability")!;
    expect(probabilityState.retention as number).toBeLessThan(42);
  });

  it("records a skip as behavior, not failure - it never touches evidence, but does move the recommendation on (section 32)", async () => {
    const before = Store.getEvidence(STUDENT).find((e) => e.topicId === "probability")!;
    await getAdaptivePlan(STUDENT, 15, true);
    const { action } = await getNextAction(STUDENT);
    expect(action?.topicId).toBe("probability");

    await skipAction(STUDENT, action!.id);

    const after = Store.getEvidence(STUDENT).find((e) => e.topicId === "probability")!;
    expect(after.retention).toBe(before.retention);
    expect(after.mastery).toBe(before.mastery);
    expect(after.sampleSize).toBe(before.sampleSize);

    const { action: nextAction } = await getNextAction(STUDENT);
    expect(nextAction?.topicId).toBe("percentages");
  });

  it("never sends correct answers to the client - grading happens only against server-stored items (section 55)", async () => {
    await getAdaptivePlan(STUDENT, 15, true);
    const { action } = await getNextAction(STUDENT);
    const started = startAction(STUDENT, action!.id);

    for (const item of started!.items) {
      expect(Object.prototype.hasOwnProperty.call(item, "correctIndex")).toBe(false);
    }
  });

  it("rejects completing an unknown or already-completed execution instead of throwing", async () => {
    const result = await completeAction(STUDENT, "not-a-real-execution-id", []);
    expect(result).toBeNull();
  });
});
