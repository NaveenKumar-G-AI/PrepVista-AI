/**
 * Runs the spec's own section-56 demonstration flow against the REAL
 * running server over HTTP (not calling services directly) - this exercises
 * auth, RLS-scoped queries, the question pool, the decision engine, the
 * review scheduler, and signal emission exactly the way a real client
 * would. Requires the server already running on PORT, and the seed script
 * already applied.
 */
import "dotenv/config";
import { SEED_ANSWER_KEY } from "./seedAnswerKey.js";

const BASE = `http://localhost:${process.env.PORT || 4008}`;

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Ingest calls are server-to-server (Feature 5/6 -> Feature 8), so they use
 *  the shared service key instead of a student's JWT (see serviceAuth.ts). */
async function ingest(body: unknown) {
  const res = await fetch(`${BASE}/mastery/ingest/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ACEAPT-Service-Key": process.env.INTERNAL_INGEST_KEY || "" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`ingest -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function log(label: string, value: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Answers each question using the REAL correct answer, which this script
 * can see only because it's reading our own seed fixture data (see
 * seedAnswerKey.ts) - not because the API exposes it. The student-facing
 * API never reveals correctness or the answer key before a submission
 * (spec section 29/51); a real client would send whatever the student typed.
 */
async function runVerification(token: string, skillId: string, label: string) {
  const start = await api("POST", `/mastery/${skillId}/verify/start`, {}, token);
  console.log(`[${label}] started attempt ${start.attemptId} objective=${start.objective} questions=${start.totalQuestions}`);

  for (let i = 0; i < start.totalQuestions; i++) {
    const current = await api("GET", `/mastery/verify/${start.attemptId}`, undefined, token);
    const correctChoiceId = SEED_ANSWER_KEY[current.question.prompt];
    const answer = correctChoiceId ?? current.question.choices[0].id;
    await api("POST", `/mastery/verify/${start.attemptId}/answer`, { skillId, studentAnswer: answer, timeTakenSeconds: 25 }, token);
  }

  const result = await api("POST", `/mastery/verify/${start.attemptId}/complete`, { skillId }, token);
  console.log(`[${label}] result=${result.result} state=${result.state} confidence=${result.confidence} correct=${result.correctCount}/${result.totalQuestions}`);
  return result;
}

async function main() {
  const email = `demo_${Date.now()}@example.com`;
  const { token, student } = await api("POST", "/auth/register", { email, password: "demo-pass-123", name: "Demo Student" });
  console.log(`Registered student ${student.id} (${email})`);

  const { skills } = await api("GET", "/skills", undefined, token);
  const di = skills.find((s: any) => s.key === "data-interpretation");
  if (!di) throw new Error("data-interpretation skill not found - did you run `npm run seed` first?");

  log("STEP 1 - Feature 6 detects weak Data Interpretation", { accuracy: 0.61, speed: 0.52, readinessImpact: "HIGH" });

  console.log("\n=== STEP 2/3 - Feature 5 adaptive practice: student improves 61% -> 88% (ingested as PRACTICE evidence) ===");
  const practiceScores = [0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88];
  for (const score of practiceScores) {
    await ingest({
      studentId: student.id,
      skillId: di.id,
      evidenceType: "PRACTICE",
      score,
      difficulty: 0.5,
      contextType: "LABELED",
      noveltyLevel: "FAMILIAR",
      source: "FEATURE_5_PRACTICE",
    });
  }
  const mapAfterPractice = await api("GET", `/mastery/${di.id}`, undefined, token);
  console.log("State after practice improvement:", mapAfterPractice.state.state, mapAfterPractice.state.confidence);

  console.log("\n=== STEP 4 - Feature 8: practice improvement detected, mastery verification still required (PROVISIONAL_CHECK) ===");
  await runVerification(token, di.id, "PROVISIONAL_CHECK");

  console.log("\n=== STEP 4b - Verify transfer with strong novel-tier performance (VERIFY_TRANSFER) ===");
  await runVerification(token, di.id, "VERIFY_TRANSFER");

  console.log("\n=== STEP 5 - Delayed verification (retention evidence) ===");
  for (const score of [0.85, 0.82]) {
    await ingest({
      studentId: student.id,
      skillId: di.id,
      evidenceType: "DELAYED",
      score,
      contextType: "LABELED",
      noveltyLevel: "SLIGHTLY_VARIANT",
      source: "SIMULATED_DELAYED_CHECK",
    });
  }

  console.log("\n=== STEP 6/7 - Stability check (timed, mixed-context) ===");
  await runVerification(token, di.id, "STABILITY_OR_MAINTENANCE_CHECK");

  const finalState = await api("GET", `/mastery/${di.id}`, undefined, token);
  log("FINAL STATE", finalState.state);

  const explain = await api("GET", `/mastery/${di.id}/explain`, undefined, token);
  log("EXPLAIN (why ACEAPT believes this)", explain);

  const map = await api("GET", "/mastery", undefined, token);
  log("MASTERY MAP", map);

  const history = await api("GET", `/mastery/history/${di.id}`, undefined, token);
  log("HISTORY + BEFORE/AFTER", history);

  const reviews = await api("GET", "/mastery/reviews", undefined, token);
  log("REVIEW QUEUE", reviews);

  const signals = await api("GET", "/signals", undefined, token);
  log("SIGNALS THAT WOULD REACH FEATURE 3/4/7", signals);

  console.log("\nDemo walkthrough complete.");
}

main().catch((err) => {
  console.error("DEMO FAILED:", err);
  process.exitCode = 1;
});
