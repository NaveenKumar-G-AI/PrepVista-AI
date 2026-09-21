import type { AddressInfo } from "node:net";
import { createApp } from "../src/api/app.js";
import { seedDemoStudent } from "./lib/seedData.js";
import { closeAllPools, withStudentContext, withServiceContext } from "../src/db/pool.js";
import { getAttemptsForSession } from "../src/db/repositories/attemptRepo.js";
import { createQuestion } from "../src/db/repositories/fixtureRepo.js";
import { ERROR_FEEDBACK_TEMPLATES } from "../src/ai/promptTemplates.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, extra?: string): void {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    failures.push(name + (extra ? ` (${extra})` : ""));
    console.log(`  \u2717 ${name}${extra ? ` \u2014 ${extra}` : ""}`);
  }
}

function approx(actual: unknown, expected: number, tolerance = 0.6): boolean {
  return typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function main() {
  console.log("Seeding demo data (student A: full history; student B: isolation control)...");
  const seedA = await seedDemoStudent();
  const seedB = await seedDemoStudent();

  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const authA = { authorization: `Bearer ${seedA.studentId}` };
  const authB = { authorization: `Bearer ${seedB.studentId}` };

  async function api(
    method: string,
    path: string,
    opts: { auth?: Record<string, string>; body?: unknown } = {}
  ): Promise<{ status: number; body: Json }> {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(opts.auth ?? authA) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  console.log("\n== Health ==");
  const health = await api("GET", "/health");
  check("GET /health returns 200", health.status === 200);

  console.log("\n== \u00a760 Dashboard ==");
  const dash = await api("GET", "/accuracy/dashboard");
  const dashData = dash.body?.data;
  check("dashboard returns 200", dash.status === 200);
  check(
    "overall accuracy matches hand-computed value from seed arithmetic",
    approx(dashData?.overallAccuracy, seedA.expected.overallAccuracy),
    `got ${dashData?.overallAccuracy}, expected ~${seedA.expected.overallAccuracy}`
  );
  check("confidence is high with 170 seeded attempts", dashData?.confidence === "high");
  check(
    "\u00a761-62 current focus identifies the Probability skill",
    dashData?.currentFocus?.skillId === seedA.skills.probability.skillId
  );
  check(
    "current focus error type is STRATEGY_ERROR, the dominant recurring error",
    dashData?.currentFocus?.errorType === "STRATEGY_ERROR"
  );
  check(
    "strongest skill is Percentages (95%), not Probability",
    dashData?.strongestSkill?.skillId === seedA.skills.percentages.skillId
  );

  console.log("\n== \u00a761 Bottlenecks ==");
  const bottlenecks = await api("GET", "/accuracy/bottlenecks");
  const top = bottlenecks.body?.data?.[0];
  check("bottlenecks returns 200", bottlenecks.status === 200);
  check(
    "top bottleneck is STRATEGY_ERROR on Probability",
    top?.errorType === "STRATEGY_ERROR" && top?.skillId === seedA.skills.probability.skillId
  );
  check("top bottleneck intervention is STRATEGY_SELECTION_DRILL", top?.interventionType === "STRATEGY_SELECTION_DRILL");
  check(
    "top bottleneck recurrence status reflects real repetition (not falsely 'isolated')",
    ["recurring", "clustered"].includes(top?.recurrenceStatus)
  );

  console.log("\n== \u00a762 Error pattern card ==");
  const card = await api("GET", "/accuracy/error-pattern-card");
  check("error pattern card returns 200", card.status === 200);
  check(
    "card includes a non-empty why-this-focus explanation",
    typeof card.body?.data?.whyThisFocus === "string" && card.body.data.whyThisFocus.length > 0
  );

  console.log("\n== \u00a714 Profile \u2014 independent vs. guided gap on Probability ==");
  const profile = await api("GET", "/accuracy/profile");
  const probRow = (profile.body?.data?.bySkill ?? []).find((r: Json) => r.scopeId === seedA.skills.probability.skillId);
  check("Probability sub-dimensions are present with high confidence", probRow?.confidence === "high");
  check(
    "independent accuracy \u224870% matches hand-computed value",
    approx(probRow?.independentAccuracy, seedA.expected.probability.independentAccuracy)
  );
  check(
    "\u00a720/\u00a759 guided accuracy is well above independent accuracy (assistance-dependency shape)",
    (probRow?.accuracy ?? 0) - (probRow?.independentAccuracy ?? 0) >= 10
  );

  console.log("\n== \u00a795-97 Training session lifecycle (replays the spec's own \u00a7143 walkthrough) ==");
  const plan = seedA.skills.probability.questionIds.slice(0, 3);
  const start = await api("POST", "/accuracy/training", {
    body: {
      trainingType: "STRATEGY_PRECISION",
      targetSkillId: seedA.skills.probability.skillId,
      targetErrorType: "STRATEGY_ERROR",
      mode: "guided",
      questionPlan: plan
    }
  });
  const sessionId = start.body?.data?.id;
  check("start training returns 201", start.status === 201);
  check("session starts ACTIVE", start.body?.data?.status === "ACTIVE");

  const a1 = await api("POST", `/accuracy/training/${sessionId}/attempts/1`, {
    body: {
      questionId: plan[0],
      skillId: seedA.skills.probability.skillId,
      isCorrect: false,
      errorType: "STRATEGY_ERROR",
      difficulty: "medium",
      hintLevel: "guided"
    }
  });
  check(
    "\u00a764 wrong-answer feedback is not a blunt 'Wrong'",
    typeof a1.body?.data?.message === "string" && !/^wrong\.?$/i.test(a1.body.data.message)
  );
  check(
    "\u00a7101/\u00a7130 with no ANTHROPIC_API_KEY set, feedback is the exact deterministic fallback template",
    a1.body?.data?.message === ERROR_FEEDBACK_TEMPLATES.STRATEGY_ERROR
  );
  check(
    "\u00a7119 recurrence status is recurring (the 8th STRATEGY_ERROR occurrence on this skill)",
    a1.body?.data?.recurrenceStatus === "recurring"
  );
  check("policy raises priority for a recurring error", a1.body?.data?.policyDecision?.priorityRaised === true);
  check("recommended next state is RETRY", a1.body?.data?.recommendedNextState === "RETRY");
  check("session moved to FEEDBACK", a1.body?.data?.session?.status === "FEEDBACK");

  const t1 = await api("POST", `/accuracy/training/${sessionId}/transition`, { body: { to: "RETRY" } });
  check("transition to RETRY succeeds", t1.status === 200 && t1.body?.data?.status === "RETRY");

  console.log("\n== \u00a796/\u00a7134 Concurrency: identical double-submit at the same slot ==");
  const dupBody = {
    questionId: plan[1],
    skillId: seedA.skills.probability.skillId,
    isCorrect: true,
    difficulty: "medium",
    hintLevel: "guided"
  };
  const [dupA, dupB] = await Promise.all([
    api("POST", `/accuracy/training/${sessionId}/attempts/2`, { body: dupBody }),
    api("POST", `/accuracy/training/${sessionId}/attempts/2`, { body: dupBody })
  ]);
  check("both concurrent requests succeed (200)", dupA.status === 200 && dupB.status === 200);
  check(
    "both requests resolve to the SAME attempt id \u2014 no duplicate row was created",
    dupA.body?.data?.attempt?.id === dupB.body?.data?.attempt?.id
  );
  const rowsAtSeq2 = await withStudentContext(seedA.studentId, (client) => getAttemptsForSession(client, sessionId));
  check(
    "exactly one attempt row exists at sequence 2 in the database itself",
    rowsAtSeq2.filter((r) => r.sequenceNumber === 2).length === 1
  );

  const t2 = await api("POST", `/accuracy/training/${sessionId}/transition`, { body: { to: "ACTIVE" } });
  check("transition to ACTIVE succeeds", t2.status === 200);

  const a3 = await api("POST", `/accuracy/training/${sessionId}/attempts/3`, {
    body: { questionId: plan[2], skillId: seedA.skills.probability.skillId, isCorrect: true, difficulty: "medium", hintLevel: "guided" }
  });
  check(
    "attempt 3 (correct) recommends VERIFICATION now that the 3-question plan is exhausted",
    a3.body?.data?.recommendedNextState === "VERIFICATION"
  );

  const t3 = await api("POST", `/accuracy/training/${sessionId}/transition`, { body: { to: "VERIFICATION" } });
  check("transition to VERIFICATION succeeds", t3.status === 200 && t3.body?.data?.status === "VERIFICATION");

  const freshQuestionId = seedA.liveSessionQuestionIds[0];
  const a4 = await api("POST", `/accuracy/training/${sessionId}/attempts/4`, {
    body: {
      questionId: freshQuestionId,
      skillId: seedA.skills.probability.skillId,
      isCorrect: true,
      difficulty: "medium",
      hintLevel: "independent",
      isNovel: true
    }
  });
  check("\u00a7143 'novel problem, solved independently' attempt is recorded correctly", a4.body?.data?.attempt?.isCorrect === true);
  check(
    "recommends COMPLETED once an independent attempt exists and the plan is exhausted",
    a4.body?.data?.recommendedNextState === "COMPLETED"
  );

  console.log("\n== \u00a767/\u00a7110 Completion \u2014 before/after, outcome, cross-feature signals ==");
  const complete = await api("POST", `/accuracy/training/${sessionId}/transition`, { body: { to: "COMPLETED" } });
  const outcome = complete.body?.data?.outcome;
  check("completion returns 200", complete.status === 200);
  check("outcome reports 4 questions attempted, 3 correct", outcome?.questionsTotal === 4 && outcome?.questionsCorrect === 3);
  check("\u00a750 independent verification passed", outcome?.independentVerificationPassed === true);
  check(
    "\u00a768 summary reports a real number rather than fake praise",
    typeof outcome?.summaryMessage === "string" && /%/.test(outcome.summaryMessage)
  );
  const doubleComplete = await api("POST", `/accuracy/training/${sessionId}/transition`, { body: { to: "COMPLETED" } });
  check("\u00a795 COMPLETED is terminal \u2014 re-completing is rejected (409)", doubleComplete.status === 409);

  console.log("\n== \u00a7129 Invalid question is excluded from evidence ==");
  const invalidQuestionId = await withServiceContext((client) =>
    createQuestion(client, {
      skillId: seedA.skills.probability.skillId,
      difficulty: "medium",
      prompt: "A deliberately invalid question for the \u00a7129 test",
      correctAnswer: { value: 1 },
      isValid: false,
      steps: null
    })
  );
  const invalidPlanStart = await api("POST", "/accuracy/training", {
    body: { trainingType: "STRATEGY_PRECISION", mode: "guided", questionPlan: [invalidQuestionId] }
  });
  const invalidSessionId = invalidPlanStart.body?.data?.id;
  const invalidAttempt = await api("POST", `/accuracy/training/${invalidSessionId}/attempts/1`, {
    body: {
      questionId: invalidQuestionId,
      skillId: seedA.skills.probability.skillId,
      isCorrect: false,
      difficulty: "medium",
      hintLevel: "guided",
      questionValid: false
    }
  });
  check(
    "an invalid-question attempt does not get scored as a real error",
    invalidAttempt.body?.data?.recurrenceStatus === null
  );
  check(
    "an invalid-question attempt does NOT trigger a RETRY loop despite being marked incorrect",
    invalidAttempt.body?.data?.recommendedNextState !== "RETRY"
  );

  console.log("\n== \u00a797/\u00a7133 Session recovery after a simulated refresh ==");
  const seedC = await seedDemoStudent();
  const authC = { authorization: `Bearer ${seedC.studentId}` };
  const recStart = await api("POST", "/accuracy/training", {
    auth: authC,
    body: { trainingType: "CALCULATION_PRECISION", mode: "guided", questionPlan: seedC.liveSessionQuestionIds.slice(0, 2) }
  });
  const recSessionId = recStart.body?.data?.id;
  await api("POST", `/accuracy/training/${recSessionId}/attempts/1`, {
    auth: authC,
    body: {
      questionId: seedC.liveSessionQuestionIds[0],
      skillId: seedC.skills.probability.skillId,
      isCorrect: true,
      difficulty: "medium",
      hintLevel: "guided"
    }
  });
  // "Refresh": a brand new request, with nothing but the auth token, asks what's active.
  const recovered = await api("GET", "/accuracy/training/active", { auth: authC });
  check("recovery finds the same session id after a simulated refresh", recovered.body?.data?.id === recSessionId);
  check("recovered session still shows the attempt made before the refresh", recovered.body?.data?.cursorPosition === 1);

  console.log("\n== \u00a7132 Security \u2014 cross-student isolation is enforced by RLS, not just app logic ==");
  const crossFetch = await api("GET", `/accuracy/training/${sessionId}`, { auth: authB }); // B reading A's session
  check("student B cannot read student A's session via the API (404)", crossFetch.status === 404);

  const rawCrossCheck = await withStudentContext(seedB.studentId, (client) =>
    client.query("SELECT 1 FROM accuracy_training_session WHERE id = $1", [sessionId])
  );
  check(
    "at the database level, student B's RLS-scoped connection sees ZERO rows for student A's session (not just an app-level 404)",
    rawCrossCheck.rowCount === 0
  );

  const crossDashboard = await api("GET", "/accuracy/dashboard", { auth: authB });
  check(
    "student B's dashboard focus points at student B's OWN Probability skill id, not student A's",
    crossDashboard.body?.data?.currentFocus?.skillId === seedB.skills.probability.skillId &&
      crossDashboard.body?.data?.currentFocus?.skillId !== seedA.skills.probability.skillId
  );

  server.close();
  await closeAllPools();

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total checks`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(` - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Walkthrough crashed:", err);
  await closeAllPools();
  process.exit(1);
});
