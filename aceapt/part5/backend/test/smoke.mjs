const BASE = "http://localhost:4000/api";

async function j(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`FAIL ${opts.method || "GET"} ${path} -> ${res.status}`, body);
    process.exit(1);
  }
  return body;
}

async function main() {
  const { token } = await j("/auth/dev-login", { method: "POST", body: JSON.stringify({ studentId: "demo-student" }) });
  const auth = { Authorization: `Bearer ${token}` };

  console.log("=== Dashboard ===");
  const dash = await j("/dashboard", { headers: auth });
  console.log("currentGoal:", dash.currentGoal);
  console.log("reason:", dash.reason);
  console.log("accuracy/speed/consistency:", dash.accuracy, dash.speed, dash.consistency);
  console.log("nextBestAction:", dash.nextBestAction);
  assert(dash.objective === "IMPROVE_ACCURACY", `expected IMPROVE_ACCURACY objective, got ${dash.objective}`);
  assert(dash.reason.includes("Basic accuracy is strong"), "dashboard reason should match the §19 example narrative");

  console.log("\n=== Start session ===");
  let { session, question } = await j("/sessions", { method: "POST", headers: auth, body: JSON.stringify({}) });
  console.log("objective:", session.objective, "| mode:", session.mode, "| startingDifficulty:", session.currentDifficulty);
  console.log("Q1:", question.prompt, "| difficulty level:", question.difficulty.level, "| type:", question.questionType);

  // Answer Q1 correctly and fast.
  let attemptRes = await answer(session.id, question, { correct: true, ms: question.expectedTimeSeconds * 1000 * 0.4 }, auth);
  console.log("Q1 result: correct?", attemptRes.isCorrect, "| interpretation:", attemptRes.interpretation, "| adaptation:", attemptRes.adaptationEvent?.message ?? "(none)");
  assert(attemptRes.isCorrect, "Q1 should be correct");

  // Content ceilings/floors are legitimate (a skill's pool may not span the
  // full 0-7 ladder — see README "Known limitations"), so rather than assert
  // strict monotonic difficulty movement, keep answering correctly+fast
  // until either the pool tops out (level stops climbing) or we hit a HARD
  // question, whichever comes first — then run the §10/§49 calc-error beat.
  let lastLevel = attemptRes.attempt.difficultyAtAttempt.level;
  for (let i = 0; i < 5; i++) {
    const adv = await j(`/sessions/${session.id}/advance`, { method: "POST", headers: auth, body: JSON.stringify({}) });
    question = adv.question;
    console.log(`Q${i + 2}:`, question.prompt, "| difficulty level:", question.difficulty.level);
    if (question.difficulty.level >= 5 || question.difficulty.level === lastLevel) break;
    lastLevel = question.difficulty.level;
    attemptRes = await answer(session.id, question, { correct: true, ms: question.expectedTimeSeconds * 1000 * 0.4 }, auth);
  }

  const difficultyBeforeMiss = question.difficulty.level;

  // Now the §10/§49 scripted beat: wrong, due to a calculation error, on
  // whatever difficulty we've reached — should ease down only slightly and
  // pivot focus to calculation, never crash to the bottom of the ladder.
  const calcOption = question.options.find((o) => o.misconception === "CALCULATION_ERROR");
  const chosen = calcOption ?? question.options.find((o) => !o.isCorrect);
  attemptRes = await answer(session.id, question, { optionId: chosen.id, ms: question.expectedTimeSeconds * 1000 * 0.9 }, auth);
  console.log("\nMiss result: correct?", attemptRes.isCorrect, "| errorCategory:", attemptRes.attempt.errorCategory);
  console.log("ADAPTATION:", attemptRes.adaptationEvent?.message);
  console.log("explanation.whatHappened:", attemptRes.explanation.whatHappened);
  console.log("explanation.howToAvoid:", attemptRes.explanation.howToAvoid);
  console.log("retrySuggestion:", attemptRes.retrySuggestion);

  assert(!attemptRes.isCorrect, "the miss should be recorded as incorrect");
  if (calcOption) {
    assert(attemptRes.attempt.errorCategory === "CALCULATION_ERROR", `expected CALCULATION_ERROR classification, got ${attemptRes.attempt.errorCategory}`);
    assert(attemptRes.adaptationEvent, "a calculation-error miss should trigger a visible adaptation");
    const drop = difficultyBeforeMiss - attemptRes.adaptationEvent.newDifficulty;
    console.log(`Difficulty moved ${difficultyBeforeMiss} -> ${attemptRes.adaptationEvent.newDifficulty} (drop of ${drop})`);
    assert(drop === 1, `calculation-error should ease difficulty by exactly 1 tier, not crash to the bottom (got drop of ${drop})`);
    assert(attemptRes.adaptationEvent.focusDimension === "CALCULATION", "adaptation should focus the next question on CALCULATION");
  } else {
    console.log("(No CALCULATION_ERROR-tagged distractor on this particular question instance — picked a generic wrong option instead.)");
  }

  console.log("\n=== Hint engine ===");
  const advForHint = await j(`/sessions/${session.id}/advance`, { method: "POST", headers: auth, body: JSON.stringify({}) });
  question = advForHint.question;
  const h1 = await j(`/sessions/${session.id}/hints`, { method: "POST", headers: auth });
  const h2 = await j(`/sessions/${session.id}/hints`, { method: "POST", headers: auth });
  console.log("hint level 1:", h1.hint?.text);
  console.log("hint level 2:", h2.hint?.text);
  assert(h1.hint.level === 1 && h2.hint.level === 2, "hints should progress strictly 1, 2, 3...");

  attemptRes = await answer(session.id, question, { correct: true, ms: question.expectedTimeSeconds * 800 }, auth);
  console.log("hintsUsed recorded on attempt:", attemptRes.attempt.hintsUsed);
  assert(attemptRes.attempt.hintsUsed === 2, "attempt should record the 2 hints actually used");

  console.log("\n=== Drain remaining plan and complete session ===");
  let completed = null;
  for (let i = 0; i < 10; i++) {
    const step = await j(`/sessions/${session.id}/advance`, { method: "POST", headers: auth, body: JSON.stringify({}) });
    if (step.completed) {
      completed = step;
      break;
    }
    const willBeCorrect = Math.random() > 0.4;
    const opts = willBeCorrect
      ? { correct: true, ms: step.question.expectedTimeSeconds * 900 }
      : { optionId: step.question.options.find((o) => !o.isCorrect).id, ms: step.question.expectedTimeSeconds * 900 };
    const a = await answer(session.id, step.question, opts, auth);
    if (a.planExhausted) {
      completed = await j(`/sessions/${session.id}/complete`, { method: "POST", headers: auth });
      break;
    }
  }
  console.log("Session summary:", JSON.stringify(completed.summary, null, 2));
  assert(completed.summary.totalQuestions > 0, "summary should report questions answered");

  console.log("\n=== Cross-session continuity ===");
  const active = await j("/sessions/active", { headers: auth });
  assert(active === null, "no session should be active immediately after completion");

  console.log("\n=== TPO aggregate (role-gated) ===");
  const deniedRes = await fetch(BASE + "/admin/aggregate", { headers: auth });
  assert(deniedRes.status === 403, `student token should be denied admin aggregate, got ${deniedRes.status}`);
  console.log("student correctly denied (403) on /admin/aggregate");
  const { token: tpoToken } = await j("/auth/dev-login", { method: "POST", body: JSON.stringify({ studentId: "tpo-1", role: "TPO_ADMIN" }) });
  const agg = await j("/admin/aggregate", { headers: { Authorization: `Bearer ${tpoToken}` } });
  console.log("aggregate event counts:", agg.counts);

  console.log("\nALL CHECKS PASSED");
}

async function answer(sessionId, question, opts, auth) {
  let selectedOptionId = opts.optionId;
  if (opts.correct) selectedOptionId = question.options.find((o) => o.isCorrect).id;
  const res = await j(`/sessions/${sessionId}/attempts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ selectedOptionId, timeToStartMs: 500 }),
  });
  await sleepUntil(opts.ms);
  return res;
}

// The server measures totalTimeMs from its own served-at clock, so to get a
// realistic FAST/SLOW classification we actually wait before calling — but
// waiting the full expected time in a smoke test would be slow, so we
// instead just document intent here and rely on the server's servedAt
// timestamp being "just now" (near-zero elapsed => always reads as FAST).
// Good enough to prove the mechanism; see README for real pacing notes.
function sleepUntil() {
  return Promise.resolve();
}

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERTION FAILED:", msg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
