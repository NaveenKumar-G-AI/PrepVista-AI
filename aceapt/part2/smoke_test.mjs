import { DatabaseSync } from "node:sqlite";

const BASE = "http://localhost:3000";
const db = new DatabaseSync("./data/aceapt.db");

function getAnswerKey(questionId) {
  const row = db.prepare("SELECT correct_answer, options, skill_node_id FROM questions WHERE id = ?").get(questionId);
  return { correctAnswer: row.correct_answer, options: JSON.parse(row.options), skillNodeId: row.skill_node_id };
}

// Deliberately answer the Percentage Application / Profit & Loss chain
// wrong, and Verbal-Vocabulary-in-Context questions right despite a LOW
// self-rating, to exercise root-cause detection AND the unexpected-strength
// path in one real run through the actual HTTP + DB stack.
const WRONG_ON_PURPOSE = new Set(["Q_PNL", "Q_PCT_A"]);

let cookie = "";
function headers(extra = {}) {
  return { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extra };
}
async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: headers(opts.headers) });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log("1) Creating onboarding context (Feature 1 stand-in)...");
  const { onboardingContextId } = await call("/api/onboarding-context", {
    method: "POST",
    body: JSON.stringify({
      preparationGoal: "Campus placement",
      targetDate: null,
      timelineCategory: "MODERATE",
      daysAvailable: 45,
      experienceLevel: "FIRST_TIME",
      previousPreparation: null,
      confidenceQuantitative: "HIGH",
      confidenceLogical: "MEDIUM",
      confidenceVerbal: "LOW",
      confidenceTimePressure: "MEDIUM",
      primaryPainPoint: "CONCEPTUAL_GAPS",
      secondaryPainPoints: ["SPEED"],
    }),
  });
  console.log("   onboardingContextId:", onboardingContextId);

  console.log("2) Starting diagnostic session...");
  const { sessionId } = await call("/api/diagnostic/start", {
    method: "POST",
    body: JSON.stringify({ onboardingContextId }),
  });
  console.log("   sessionId:", sessionId);

  console.log("3) Running the adaptive loop...");
  let count = 0;
  const purposesSeen = new Set();
  const domainsSeen = new Set();
  while (true) {
    const next = await call(`/api/diagnostic/${sessionId}/next-question`);
    if (next.done) {
      console.log(`   done after ${count} questions. reason: ${next.reason}`);
      break;
    }
    count++;
    const { correctAnswer, options, skillNodeId } = getAnswerKey(next.question.id);
    domainsSeen.add(next.domain);
    const answerWrong = WRONG_ON_PURPOSE.has(skillNodeId);
    const studentAnswer = answerWrong ? options.find((o) => o !== correctAnswer) : correctAnswer;

    const startedAt = new Date().toISOString();
    await call(`/api/diagnostic/${sessionId}/respond`, {
      method: "POST",
      body: JSON.stringify({
        presentationId: next.presentationId,
        status: "ANSWERED",
        studentAnswer,
        confidenceLevel: next.captureConfidence ? (answerWrong ? "CONFIDENT" : "SOMEWHAT_CONFIDENT") : null,
        questionStartedAt: startedAt,
        questionAnsweredAt: new Date(Date.now() + 5000).toISOString(),
      }),
    });
    if (count > 40) throw new Error("Loop did not terminate — possible bug in stopping condition.");
  }
  console.log("   domains touched:", [...domainsSeen].join(", "));

  console.log("4) Fetching the completed report...");
  const result = await call(`/api/diagnostic/${sessionId}/complete`, { method: "POST" });

  console.log("\n=== RESULT SUMMARY ===");
  console.log("overallCapability:", result.overallCapability);
  console.log("accuracyOverall:", result.accuracyOverall);
  console.log("aiGenerationStatus:", result.aiGenerationStatus);
  console.log("strengths:", result.strengths);
  console.log("focusAreas:", result.focusAreas);
  console.log("possibleRootCauses:", JSON.stringify(result.possibleRootCauses, null, 2));
  console.log("unexpectedFindings:", JSON.stringify(result.unexpectedFindings, null, 2));
  console.log("recommendedStartingPointSkillId:", result.recommendedStartingPointSkillId);
  console.log("recommendedStartingPointReason:", result.recommendedStartingPointReason);
  console.log("aiNarrative.overallSummary:", result.aiNarrative?.overallSummary);

  console.log("\n5) Testing idempotent re-complete (should return same result, not error)...");
  const result2 = await call(`/api/diagnostic/${sessionId}/complete`, { method: "POST" });
  if (result2.id !== result.id) throw new Error("Idempotency check failed — complete produced a second result.");
  console.log("   OK — idempotent.");

  console.log("\n6) Testing resume/state endpoint on a completed session...");
  const state = await call(`/api/diagnostic/${sessionId}/state`);
  console.log("   state:", JSON.stringify(state));

  console.log("\n7) Testing authorization: a fresh cookie-less client must NOT read this session...");
  const unauthedRes = await fetch(`${BASE}/api/diagnostic/${sessionId}/state`);
  if (unauthedRes.status !== 403) throw new Error(`Expected 403 for unauthenticated access, got ${unauthedRes.status}`);
  console.log("   OK — got 403 as expected.");

  console.log("\nALL SMOKE TESTS PASSED.");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
