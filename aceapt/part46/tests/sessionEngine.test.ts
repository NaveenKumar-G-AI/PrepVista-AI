import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildIntegrationBundle } from "../src/integrations";
import { FileSocraticRepository } from "../src/repositories/socraticRepository";
import { ForbiddenError, SessionEngine, SessionNotFoundError } from "../src/domain/sessionEngine";

function makeEngine() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceapt-test-"));
  const repo = new FileSocraticRepository(dir);
  const engine = new SessionEngine(repo, buildIntegrationBundle());
  return { engine, repo };
}

describe("SessionEngine - full worked session (mirrors spec section 129)", () => {
  it("moves a student from a bare correct guess through reasoning, independent transfer, and a final teach-back to COMPLETED", async () => {
    const { engine } = makeEngine();
    const studentId = "student-1";

    const start = await engine.startSession(studentId);
    expect(start.session.state).toBe("IDENTIFICATION");
    const base = Number(start.session.problemContext.variables.base);
    const newValue = Number(start.session.problemContext.variables.newValue);

    // A bare correct answer, no reasoning - must NOT be treated as understanding.
    const r1 = await engine.respond(start.session.id, studentId, String(newValue));
    expect(r1.tutorTurn.responseClassification).toBe("CORRECT_GUESS");
    expect(r1.session.state).toBe("GUIDED_REASONING");

    // Explaining the reasoning behind it, referencing the base value.
    const r2 = await engine.respond(start.session.id, studentId, `${base} is the original value, and I took % of it`);
    expect(r2.tutorTurn.responseClassification).toBe("CORRECT_REASONING");
    // CHECKPOINT must cascade straight through to INDEPENDENT_ATTEMPT, never persist as CHECKPOINT.
    expect(r2.session.state).toBe("INDEPENDENT_ATTEMPT");
    const independentAnswer = r2.session.problemContext.trustedAnswer;

    const r3 = await engine.respond(start.session.id, studentId, String(independentAnswer));
    expect(r3.session.state).toBe("TRANSFER_VERIFICATION");
    const transferAnswer = r3.session.problemContext.trustedAnswer;

    const r4 = await engine.respond(start.session.id, studentId, String(transferAnswer));
    expect(r4.session.state).toBe("TEACH_BACK");

    const r5 = await engine.respond(
      start.session.id,
      studentId,
      "You divide by the original value, not the new one, because that is what the percentage is measured against."
    );
    expect(r5.session.state).toBe("COMPLETED");
    expect(r5.session.status).toBe("completed");
    expect(r5.session.completionSummary?.verification).toBe("independent_problem_solved");
    expect(r5.session.completionSummary?.demonstrated).toContain("Identified original value");
    expect(r5.session.completionSummary?.demonstrated).toContain("Explained reasoning");
    expect(r5.session.completionSummary?.stillDeveloping).toEqual([]);
  });

  it("does not treat a correct final number alone as demonstrated understanding", async () => {
    const { engine } = makeEngine();
    const start = await engine.startSession("student-guess-only");
    const newValue = Number(start.session.problemContext.variables.newValue);
    const r1 = await engine.respond(start.session.id, "student-guess-only", String(newValue));
    expect(r1.tutorTurn.responseClassification).not.toBe("CORRECT_REASONING");
    expect(r1.session.thinkingState.achievedCriteria).toEqual([]);
  });
});

describe("SessionEngine - misconception handling (mirrors spec section 130)", () => {
  it("routes a detected misconception into the contradiction experiment and resolves it through discovery", async () => {
    const { engine } = makeEngine();
    const studentId = "student-2";
    const start = await engine.startSession(studentId);

    const r1 = await engine.respond(start.session.id, studentId, "A percentage increase and an equal percentage decrease cancel out anyway");
    expect(r1.tutorTurn.responseClassification).toBe("MISCONCEPTION");
    expect(r1.session.state).toBe("MISCONCEPTION_CHECK");
    expect(r1.session.misconceptionState).toBeDefined();

    // The experiment always anchors on base=100 regardless of the original
    // problem's numbers (section 130) - but the percent it tests carries
    // over from the actual (randomized) problem, so compute it dynamically.
    const percent = r1.session.misconceptionState!.percent;
    const afterIncrease = 100 * (1 + percent / 100);
    const afterDecrease = afterIncrease * (1 - percent / 100);

    const r2 = await engine.respond(start.session.id, studentId, String(afterIncrease));
    expect(r2.tutorTurn.responseClassification).not.toBe("INCORRECT");
    expect(r2.session.state).toBe("MISCONCEPTION_CHECK");
    expect(r2.session.misconceptionState?.step).toBe(1);

    const r3 = await engine.respond(start.session.id, studentId, String(afterDecrease));
    expect(r3.session.state).toBe("MISCONCEPTION_CHECK");
    expect(r3.session.misconceptionState?.step).toBe(2);

    const r4 = await engine.respond(start.session.id, studentId, "No, it's lower than before");
    expect(r4.session.state).toBe("MISCONCEPTION_CHECK");
    expect(r4.session.misconceptionState?.step).toBe(3);

    const r5 = await engine.respond(start.session.id, studentId, "Because the base changes after the first change");
    expect(r5.tutorTurn.responseClassification).toBe("CORRECT_REASONING");
    expect(r5.session.state).toBe("INDEPENDENT_ATTEMPT");
    expect(r5.session.misconceptionState).toBeUndefined();
  });
});

describe("SessionEngine - hints and the anti-dependency guard (section 36)", () => {
  it("escalates the hint level on each request and switches to a think-first prompt on the third", async () => {
    const { engine } = makeEngine();
    const studentId = "student-3";
    const start = await engine.startSession(studentId);

    const h1 = await engine.requestHint(start.session.id, studentId);
    expect(h1.session.state).toBe("HINT");
    expect(h1.session.thinkingState.hintLevel).toBe(1);

    const h2 = await engine.requestHint(start.session.id, studentId);
    expect(h2.session.thinkingState.hintLevel).toBe(2);

    const h3 = await engine.requestHint(start.session.id, studentId);
    expect(h3.session.state).toBe("GUIDED_REASONING");
    expect(h3.tutorTurn.content).toContain("which two quantities");
    expect(h3.session.thinkingState.hintLevel).toBe(2); // did not escalate further - it redirected instead
  });
});

describe("SessionEngine - direct explanation fallback (section 34/78)", () => {
  it("gives a full explanation on request, then still requires a teach-back and an independent check", async () => {
    const { engine } = makeEngine();
    const studentId = "student-4";
    const start = await engine.startSession(studentId);

    const explained = await engine.requestExplanation(start.session.id, studentId);
    expect(explained.session.state).toBe("PARTIAL_EXPLANATION");
    expect(explained.tutorTurn.content.toLowerCase()).toContain("original");

    const weak = await engine.respond(start.session.id, studentId, "not sure");
    // A weak first attempt gets one retry rather than an instant fail.
    expect(weak.session.state).toBe("PARTIAL_EXPLANATION");

    const proceed = await engine.respond(start.session.id, studentId, "You divide by the original value, not the new one.");
    expect(proceed.tutorTurn.responseClassification).toBe("CORRECT_REASONING");
    expect(proceed.session.state).toBe("INDEPENDENT_ATTEMPT");
  });

  it("still moves the student forward even if the retry is also weak (never traps them)", async () => {
    const { engine } = makeEngine();
    const studentId = "student-4b";
    const start = await engine.startSession(studentId);
    await engine.requestExplanation(start.session.id, studentId);
    await engine.respond(start.session.id, studentId, "not sure");
    const capped = await engine.respond(start.session.id, studentId, "still not sure");
    expect(capped.session.state).toBe("INDEPENDENT_ATTEMPT");
  });
});

describe("SessionEngine - AI fallback (section 93/107)", () => {
  it("produces a valid deterministic tutor message with no ANTHROPIC_API_KEY configured", async () => {
    const { engine } = makeEngine();
    const start = await engine.startSession("student-5");
    expect(start.tutorTurn.content.length).toBeGreaterThan(0);
    expect(start.tutorTurn.content).toBe(start.session.problemContext.prompt);
  });
});

describe("SessionEngine - security and ownership (section 90/112)", () => {
  it("refuses to let one student load another student's session", async () => {
    const { engine } = makeEngine();
    const start = await engine.startSession("owner");
    await expect(engine.getSession(start.session.id, "someone-else")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws for an unknown session id", async () => {
    const { engine } = makeEngine();
    await expect(engine.getSession("does-not-exist", "anyone")).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("SocraticRepository - optimistic concurrency (section 89/111)", () => {
  it("rejects a second update against a stale version", async () => {
    const { repo } = makeEngine();
    const session = {
      id: "s1",
      studentId: "u1",
      objective: { objective: "x", targetSkill: "x", successCriteria: [] },
      state: "IDENTIFICATION" as const,
      thinkingState: {
        objective: "x",
        targetSkill: "x",
        currentStep: "x",
        understandingState: "not_understood" as const,
        responseState: null,
        misconception: null,
        hintLevel: 0 as const,
        consecutiveHints: 0,
        consecutiveIncorrect: 0,
        independence: "not_yet" as const,
        confidenceSelfReport: null,
        turnsInCurrentState: 0,
        totalTurns: 0,
        achievedCriteria: [],
        usedHintThisProblem: false,
      },
      problemContext: { skill: "x", prompt: "x", trustedAnswer: 1, trustedSolutionSteps: [], variables: {}, generator: "x" },
      status: "active" as const,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.createSession(session);

    const firstUpdate = await repo.updateSession({ ...session, state: "GUIDED_REASONING" }, 1);
    expect(firstUpdate).toBe(true);

    // Second caller still thinks the version is 1 (stale) - must be rejected.
    const secondUpdate = await repo.updateSession({ ...session, state: "HINT" }, 1);
    expect(secondUpdate).toBe(false);
  });
});
