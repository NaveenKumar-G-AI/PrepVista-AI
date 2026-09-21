/**
 * Full live-HTTP replay of a realistic Feature 20 simulation session,
 * against the actual running server and a real Postgres database — no
 * mocks. This scripts exactly the kind of session the spec's own demo
 * story describes (§46): a strong start, one badly overinvested question,
 * two more misses with a full recovery each time, one deliberately
 * unreached question, then a targeted drill and an improvement comparison.
 *
 * Every expected number below was hand-computed against the seeded
 * question bank BEFORE running this script (see the comments) — this is
 * checking the live server's arithmetic against independently-derived
 * expected values, not just checking that it runs without throwing.
 *
 * Usage: the server must already be running (npm run dev / npm start) and
 * migrated + seeded.  npx tsx scripts/liveReplay.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:4020/api";

let passCount = 0;
function check(label: string, fn: () => void) {
  fn();
  passCount++;
  console.log(`  ✓ ${label}`);
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log("=== ACEAPT Feature 20 — live HTTP replay ===\n");

  // ---- health ----
  const health = await api("GET", "/health");
  check("health check responds ok", () => assert.equal(health.ok, true));

  // ---- start session ----
  const start = await api("POST", "/sessions", {});
  const { session, questions } = start;
  check("session starts IN_PROGRESS", () => assert.equal(session.status, "IN_PROGRESS"));
  check("blueprint has exactly 15 questions", () => assert.equal(questions.length, 15));
  check("18-minute duration is enforced server-side", () => assert.equal(session.durationSec, 18 * 60));
  check("client never receives concept/difficulty/correctIndex during the exam", () => {
    for (const q of questions) {
      assert.equal("concept" in q, false);
      assert.equal("difficulty" in q, false);
      assert.equal("correctIndex" in q, false);
      assert.equal("explanation" in q, false);
      assert.equal(q.options.length, 4);
    }
  });

  const id = (i: number) => questions[i].id as string;

  // ---- resume-shape check before anything happens ----
  const initialState = await api("GET", `/sessions/${session.id}`);
  check("fresh session state has all 15 responses unvisited", () => {
    assert.equal(initialState.responses.length, 15);
    assert.ok(initialState.responses.every((r: { status: string }) => r.status === "unvisited"));
  });

  // ---- walk through the test with a scripted, hand-verified pattern ----
  // See docstring: this exact sequence was hand-scored before running.
  await api("POST", `/sessions/${session.id}/navigate`, {
    fromQuestionId: null,
    fromIndex: null,
    toQuestionId: id(0),
    toIndex: 0,
    elapsedMs: 0,
  });

  type Step = { correctGuess: boolean | null; timeSec: number; mark?: boolean };
  // correctGuess: true = pick the right answer (server doesn't tell us the
  // index, so we resolve it after via the report's questionReview — for the
  // scripted "wrong" answers we just pick index 0 and separately guarantee
  // it doesn't collide with the right one by cross-checking after the fact).
  const plan: Step[] = [
    { correctGuess: true, timeSec: 25 }, // Q0
    { correctGuess: true, timeSec: 35 }, // Q1
    { correctGuess: false, timeSec: 220 }, // Q2 — the big overinvestment
    { correctGuess: true, timeSec: 20 }, // Q3
    { correctGuess: null, timeSec: 10, mark: true }, // Q4 — skipped after a brief look
    { correctGuess: true, timeSec: 45 }, // Q5
    { correctGuess: true, timeSec: 30 }, // Q6
    { correctGuess: false, timeSec: 60 }, // Q7
    { correctGuess: true, timeSec: 50 }, // Q8 — recovery after Q7
    { correctGuess: false, timeSec: 40 }, // Q9
    { correctGuess: true, timeSec: 25 }, // Q10 — recovery after Q9
    { correctGuess: true, timeSec: 55, mark: true }, // Q11
    { correctGuess: true, timeSec: 35 }, // Q12
    // Q13 deliberately never visited — jump straight to Q14
    { correctGuess: true, timeSec: 40 }, // Q14
  ];

  // We don't know correct indices client-side (by design), so to "answer
  // correctly" or "answer wrong" deterministically we first do a private
  // lookup against the seeded bank via the same slugs used at seed time —
  // this section of the script is the *only* place that peeks at answers,
  // standing in for "a student who happens to get these right/wrong",
  // exactly like a real test-taker's knowledge would.
  const ANSWER_KEY = [1, 2, 3, 1, 3, 1, 2, 3, 1, 3, 3, 1, 1, 2, 3]; // from questionBank.ts, in seed order
  const WRONG_PICK = ANSWER_KEY.map((correct) => (correct === 0 ? 1 : 0)); // any index != correct

  // plan[i] is the i-th question the student actually looks at. Because
  // Q13 (sequence index 13) is deliberately never visited, plan position
  // does NOT equal sequence index past that point — this table is the
  // explicit position -> sequenceIndex mapping so that isn't a landmine.
  const questionSequence = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14];
  assert.equal(questionSequence.length, plan.length);

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const qIdx = questionSequence[i];
    if (step.mark) {
      await api("POST", `/sessions/${session.id}/mark`, { questionId: id(qIdx), marked: true });
    }
    if (step.correctGuess !== null) {
      const selectedIndex = step.correctGuess ? ANSWER_KEY[qIdx] : WRONG_PICK[qIdx];
      await api("POST", `/sessions/${session.id}/answer`, { questionId: id(qIdx), selectedIndex });
    }
    const isLastStep = i === plan.length - 1;
    if (!isLastStep) {
      const nextQIdx = questionSequence[i + 1];
      await api("POST", `/sessions/${session.id}/navigate`, {
        fromQuestionId: id(qIdx),
        fromIndex: qIdx,
        toQuestionId: id(nextQIdx),
        toIndex: nextQIdx,
        elapsedMs: step.timeSec * 1000,
      });
    }
    // The final step's own elapsed time (Q14) is flushed via the submit
    // call's finalElapsedMs below, the same way a real client would report
    // the time spent on whichever question it was on when it hit Submit.
  }

  // ---- submit (flushing the final 40s spent on Q14) ----
  const submitResult = await api("POST", `/sessions/${session.id}/submit`, {
    finalQuestionId: id(14),
    finalElapsedMs: 40 * 1000,
  });
  const ev = submitResult.evidence;

  check("server decided this was a normal submission, not a timeout", () => assert.equal(submitResult.expired, false));
  check("10 correct, 3 wrong, 2 unattempted", () => {
    assert.equal(ev.correctCount, 10);
    assert.equal(ev.wrongCount, 3);
    assert.equal(ev.unattemptedCount, 2);
  });
  check("score = 10(+1) + 3(-0.25) + 2(0) = 9.25 / 15", () => {
    assert.equal(ev.score, 9.25);
    assert.equal(ev.maxScore, 15);
  });
  check("accuracy 77% on attempted, 87% attempt rate", () => {
    assert.equal(ev.accuracyPct, 77);
    assert.equal(ev.attemptRatePct, 87);
  });
  check("total tracked time is 690s (avg 46s/question)", () => {
    assert.equal(ev.totalTimeSec, 690);
    assert.ok(Math.abs(ev.avgTimePerQuestionSec - 46) < 0.1);
  });
  check("Q3 (display #3) is the only overinvested question", () => {
    assert.deepEqual(
      ev.overinvested.map((p: { sequenceIndex: number }) => p.sequenceIndex + 1),
      [3]
    );
  });
  check("biggest leak headlines the Q3/Q8 time concentration (41% of total time)", () => {
    assert.equal(ev.biggestLeak.type, "time-concentration");
    assert.deepEqual(ev.biggestLeak.questionNumbers, [3, 8]);
    assert.equal(ev.topTwoTimeSharePct, 41);
  });
  check("selection quality reads Weak given that concentration", () => assert.equal(ev.selectionQuality, "Weak"));
  check("all four hard/very-hard non-successes fully recovered next question (100%)", () => {
    assert.equal(ev.recoverableCount, 4);
    assert.equal(ev.recoveryRatePct, 100);
  });
  check("post-error accuracy is 80% (4 of 5 follow-up attempts landed)", () => {
    assert.equal(ev.postErrorAccuracyPct, 80);
  });
  check("segments show a mid-test dip (75% -> 60%) and a strong recovery finish (100%)", () => {
    assert.equal(ev.segments[0].accuracyPct, 75);
    assert.equal(ev.segments[1].accuracyPct, 60);
    assert.equal(ev.segments[2].accuracyPct, 100);
    assert.equal(ev.degrading, false); // finishes higher than it started, not lower
  });
  check("exactly one non-sequential navigation jump was logged (the 12 -> 14 skip)", () => {
    assert.equal(ev.navigationJumps, 1);
  });
  check("Q3's decision is classified Overinvestment, Q13 is Not Reached, Q5's skip is Good Skip", () => {
    const bySeq = (n: number) => ev.perQuestion.find((p: { sequenceIndex: number }) => p.sequenceIndex === n);
    assert.equal(bySeq(2).decision, "Overinvestment"); // Q3 display / seq index 2
    assert.equal(bySeq(13).decision, "Not Reached"); // Q14 display / seq index 13
    assert.equal(bySeq(4).decision, "Good Skip"); // Q5 display / seq index 4 (Very Hard, skipped fast)
  });

  // ---- report + AI narrative (no ANTHROPIC_API_KEY set -> deterministic fallback) ----
  const report = await api("GET", `/sessions/${session.id}/report`);
  check("report returns a narrative and labels its source honestly", () => {
    assert.ok(report.narrative.text.length > 20);
    assert.ok(["ai", "fallback"].includes(report.narrative.source));
  });
  check("question review reveals concept/difficulty/correctIndex now that the exam is over", () => {
    assert.equal(report.questionReview.length, 15);
    assert.ok(report.questionReview[0].concept);
    assert.ok(report.questionReview[0].difficulty);
    assert.equal(typeof report.questionReview[0].correctIndex, "number");
  });

  // ---- coaching Q&A ----
  for (const promptKey of ["analyze", "time", "skip", "drop"]) {
    const answer = await api("POST", `/sessions/${session.id}/coach`, { promptKey });
    check(`coach('${promptKey}') returns a grounded, non-empty answer`, () => {
      assert.ok(answer.text.length > 10);
    });
  }

  // ---- mock history now has exactly one entry for this student ----
  const history = await api("GET", "/mock-history");
  check("mock history recorded this attempt", () => {
    assert.ok(history.history.length >= 1);
    assert.equal(history.history[0].score, 9.25);
  });

  // ---- drill: should be a Question-Selection Drill given the Weak selection quality ----
  const drill = await api("POST", `/sessions/${session.id}/drill`);
  check("drill selector picked the selection drill (matches Weak selection quality)", () => {
    assert.equal(drill.drillChoice.type, "selection");
    assert.equal(drill.questions.length, 4);
    assert.equal(drill.session.durationSec, 3 * 60);
  });

  // Answer the drill quickly and correctly (simulating the "after training" pass).
  await api("POST", `/sessions/${drill.session.id}/navigate`, {
    fromQuestionId: null,
    fromIndex: null,
    toQuestionId: drill.questions[0].id,
    toIndex: 0,
    elapsedMs: 0,
  });
  for (let i = 0; i < drill.questions.length; i++) {
    // We don't know the drill's correct indices from the client either; just
    // answer something for every question so accuracy/timing mechanics are
    // exercised — the exact drill score isn't what this replay is proving.
    await api("POST", `/sessions/${drill.session.id}/answer`, { questionId: drill.questions[i].id, selectedIndex: 0 });
    const nextIdx = i + 1;
    if (nextIdx < drill.questions.length) {
      await api("POST", `/sessions/${drill.session.id}/navigate`, {
        fromQuestionId: drill.questions[i].id,
        fromIndex: i,
        toQuestionId: drill.questions[nextIdx].id,
        toIndex: nextIdx,
        elapsedMs: 15000,
      });
    }
  }
  const drillSubmit = await api("POST", `/sessions/${drill.session.id}/submit`, {
    finalQuestionId: drill.questions[drill.questions.length - 1].id,
    finalElapsedMs: 15000,
  });
  check("drill submits and produces its own evidence", () => {
    assert.ok(typeof drillSubmit.evidence.accuracyPct === "number");
  });

  const improvement = await api("GET", `/sessions/${drill.session.id}/improvement`);
  check("improvement screen pairs the drill's evidence with the original session's evidence", () => {
    assert.equal(improvement.mainEvidence.score, 9.25);
    assert.equal(improvement.drillEvidence.correctCount + improvement.drillEvidence.wrongCount, 4);
    assert.equal(improvement.drillLabel, "Question-Selection Drill");
  });

  // ---- server-authoritative expiry: backdate started_at directly in the DB ----
  // (proves TIME_EXPIRED is decided by the server clock, not by whatever the
  // client claims — a client cannot "un-expire" a session by lying about it)
  const { Client } = await import("pg");
  const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
  const expireStart = await api("POST", "/sessions", {});
  await pgClient.query(`UPDATE sessions SET started_at = now() - interval '20 minutes' WHERE id = $1`, [
    expireStart.session.id,
  ]);
  await pgClient.end();
  const expireSubmit = await api("POST", `/sessions/${expireStart.session.id}/submit`, {
    finalQuestionId: null,
    finalElapsedMs: 0,
  });
  check("a session whose wall-clock age exceeds the duration is flagged TIME_EXPIRED by the server", () => {
    assert.equal(expireSubmit.expired, true);
  });
  check("usedSec is clamped to the 1080s budget even though ~1200s actually elapsed, all 15 unattempted", () => {
    assert.equal(expireSubmit.evidence.totalTimeSec, 1080);
    assert.equal(expireSubmit.evidence.unattemptedCount, 15);
  });

  console.log(`\n=== ${passCount} checks passed. Live replay complete. ===`);
}

main().catch((err) => {
  console.error("\n✗ LIVE REPLAY FAILED:", err);
  process.exit(1);
});
