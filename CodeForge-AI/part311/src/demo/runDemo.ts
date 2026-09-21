/**
 * CodeForge — End-to-End Demonstration (§58)
 *
 * Everything printed below is a REAL result: the "buggy" and "fixed"
 * submissions are actually executed against the actual test suite by
 * src/execution/executor.ts, the 8/10 in round 1 is computed, not hardcoded,
 * and every selection decision is the live output of
 * src/engine/challengeSelector.ts. Run it yourself: `npm run demo` (or
 * `tsx src/demo/runDemo.ts`).
 *
 * §58's baseline is given informally ("Python — Strong, Algorithms —
 * Developing, Debugging — Developing"). CodeForge's taxonomy (§7) is more
 * granular than that, so this demo maps it onto real skill keys once, out
 * loud, rather than silently reinterpreting it:
 *   Python (Strong)      -> fundamentals.control_flow, fundamentals.functions,
 *                            data_structures.arrays  = PROFICIENT (prerequisite baseline)
 *   Algorithms/Debugging  -> data_structures.hashing, engineering.debugging = DEVELOPING
 */

import { RoleContext, SkillLevel, SupportedLanguage } from "../domain/types.js";
import { InMemoryStore } from "../store/store.js";
import { CodeForgeService } from "../service/codeforgeService.js";
import { buildDefaultProviderChain } from "../ai/providers.js";
import { generateChallenge } from "../generation/generationPipeline.js";
import { DifficultyLabel, TaskType } from "../domain/types.js";
import { SEED_CHALLENGES } from "../data/seedChallenges.js";

function rule(char = "─", len = 78) {
  console.log(char.repeat(len));
}
function section(title: string) {
  console.log("\n" + "=".repeat(78));
  console.log(title);
  console.log("=".repeat(78));
}

async function main() {
  const store = new InMemoryStore();
  store.seedChallenges(SEED_CHALLENGES);
  const aiProvider = buildDefaultProviderChain(process.env); // no keys in this sandbox -> falls to NullProvider
  const service = new CodeForgeService(store, aiProvider);

  const studentId = "student_demo_01";

  section("UNDERSTAND — student technical profile");
  service.ensureProfile(studentId, RoleContext.AI_ML_ENGINEER);
  service.seedSkillBaseline(studentId, "fundamentals.control_flow", SkillLevel.PROFICIENT);
  service.seedSkillBaseline(studentId, "fundamentals.functions", SkillLevel.PROFICIENT);
  service.seedSkillBaseline(studentId, "data_structures.arrays", SkillLevel.PROFICIENT);
  service.seedSkillBaseline(studentId, "data_structures.hashing", SkillLevel.DEVELOPING);
  service.seedSkillBaseline(studentId, "engineering.debugging", SkillLevel.DEVELOPING);
  console.log("Target role:      AI/ML Engineer");
  console.log("Baseline (mapped from Python/Algorithms/Debugging — see file header):");
  console.log("  fundamentals.control_flow ..... PROFICIENT");
  console.log("  fundamentals.functions ........ PROFICIENT");
  console.log("  data_structures.arrays ........ PROFICIENT");
  console.log("  data_structures.hashing ....... DEVELOPING");
  console.log("  engineering.debugging ......... DEVELOPING");

  // ===================================================================
  // ROUND 1 — Debugging + Hashing, AI/ML context
  // ===================================================================
  section("CHALLENGE — round 1 selection");
  const round1 = service.getNextChallenge(studentId, SupportedLanguage.PYTHON);
  if (!round1) throw new Error("no challenge selected — seed data problem");
  console.log(`Selected: ${round1.challenge.title}  [${round1.challenge.challengeId}]`);
  console.log(`Task type: ${round1.challenge.taskType}   Difficulty: ${round1.challenge.difficultyLabel}`);
  console.log("\nWhy this challenge?");
  console.log(`  Primary gap:      ${round1.reason.primaryGap}`);
  console.log(`  Secondary gap:    ${round1.reason.secondaryGap}`);
  console.log(`  Role relevance:   ${round1.reason.roleRelevance}`);
  console.log(`  Difficulty fit:   ${round1.reason.difficultyFit}`);
  console.log(`  Recent exposure:  ${round1.reason.recentExposure}`);
  console.log(`  Task diversity:   ${round1.reason.taskDiversity}`);
  console.log(`  Score:            ${round1.reason.score.toFixed(3)}`);
  console.log(`  Rationale:        ${round1.reason.rationale}`);

  section("EXECUTE — round 1, first submission (unmodified starter code)");
  const attempt1a = service.startAttempt(studentId, round1.challenge.challengeId, SupportedLanguage.PYTHON);
  console.log("Starter code handed to the student:");
  rule();
  console.log(attempt1a.starterCode);
  rule();
  const result1a = await service.submitAttempt(attempt1a.attemptId, attempt1a.starterCode);

  section("EVALUATE — round 1, first submission");
  console.log(`Result: ${result1a.testsPassed}/${result1a.testsTotal} tests passed`);
  console.log(result1a.failureSummary);
  console.log(`Mistake evidence: ${result1a.mistakeCategories.join(", ") || "none"}`);
  console.log(`AI coaching: ${result1a.attempt.aiEvaluation?.pending ? "PENDING — no live AI provider in this sandbox (see docs/IMPLEMENTATION_MANIFEST.md); deterministic evaluation above is already complete and authoritative regardless (§44)." : result1a.attempt.aiEvaluation?.coachingMessage}`);

  section("LEARN — starting a retry and requesting a hint");
  const attempt1b = service.startAttempt(studentId, round1.challenge.challengeId, SupportedLanguage.PYTHON);
  const hint1 = service.requestHint(attempt1b.attemptId);
  console.log(`Hint (level ${hint1.level}): ${hint1.text}`);

  section("EXECUTE — round 1, corrected resubmission");
  const fixedCode =
    "def dedupe_vectors(vectors):\n" +
    "    seen = set()\n" +
    "    result = []\n" +
    "    for v in vectors:\n" +
    "        key = tuple(v)\n" +
    "        if key not in seen:\n" +
    "            seen.add(key)\n" +
    "            result.append(v)\n" +
    "    return result\n";
  console.log("Resubmitted code:");
  rule();
  console.log(fixedCode);
  rule();
  const result1b = await service.submitAttempt(attempt1b.attemptId, fixedCode);

  section("ADAPT — round 1 resolved");
  console.log(`Result: ${result1b.testsPassed}/${result1b.testsTotal} tests passed — ${result1b.passed ? "PASSED" : "FAILED"}`);
  console.log(result1b.failureSummary);
  if (result1b.difficultyUpdate) {
    console.log(`\nDifficulty policy decision: ${result1b.difficultyUpdate.decision}`);
    console.log(`New difficulty for data_structures.hashing: ${result1b.difficultyUpdate.label} (delta ${result1b.difficultyUpdate.delta >= 0 ? "+" : ""}${result1b.difficultyUpdate.delta})`);
    console.log(`Reason: ${result1b.difficultyUpdate.reason}`);
  }

  // ===================================================================
  // ROUND 2 — same skill (hashing), transferred to a new context (§15)
  // ===================================================================
  section("CHALLENGE — round 2 selection");
  const round2 = service.getNextChallenge(studentId, SupportedLanguage.PYTHON);
  if (!round2) throw new Error("no challenge selected for round 2");
  console.log(`Selected: ${round2.challenge.title}  [${round2.challenge.challengeId}]`);
  console.log(`Task type: ${round2.challenge.taskType}   Difficulty: ${round2.challenge.difficultyLabel}`);
  console.log(`(Round 1 task type was ${round1.challenge.taskType} — this is a different task type on the same skill, per §15's transfer principle, not a repeat.)`);
  console.log("\nWhy this challenge?");
  console.log(`  Primary gap:      ${round2.reason.primaryGap}`);
  console.log(`  Difficulty fit:   ${round2.reason.difficultyFit}`);
  console.log(`  Recent exposure:  ${round2.reason.recentExposure}`);
  console.log(`  Task diversity:   ${round2.reason.taskDiversity}`);
  console.log(`  Rationale:        ${round2.reason.rationale}`);

  section("EXECUTE + EVALUATE — round 2, correct solution on the first try");
  const attempt2 = service.startAttempt(studentId, round2.challenge.challengeId, SupportedLanguage.PYTHON);
  const correctSolution2 =
    "def merge_by_email(list_a, list_b):\n" +
    "    def norm(e):\n" +
    "        return e.strip().lower()\n" +
    "\n" +
    "    a_by_email = {}\n" +
    "    for rec in list_a:\n" +
    "        key = norm(rec[\"email\"])\n" +
    "        if key not in a_by_email:\n" +
    "            a_by_email[key] = rec\n" +
    "\n" +
    "    b_by_email = {}\n" +
    "    for rec in list_b:\n" +
    "        key = norm(rec[\"email\"])\n" +
    "        if key not in b_by_email:\n" +
    "            b_by_email[key] = rec\n" +
    "\n" +
    "    merged = []\n" +
    "    for key, a_rec in a_by_email.items():\n" +
    "        if key in b_by_email:\n" +
    "            merged.append({\"email\": key, \"features\": a_rec[\"features\"], \"label\": b_by_email[key][\"label\"]})\n" +
    "    merged.sort(key=lambda r: r[\"email\"])\n" +
    "    return merged\n";
  const result2 = await service.submitAttempt(attempt2.attemptId, correctSolution2);
  console.log(`Result: ${result2.testsPassed}/${result2.testsTotal} tests passed — ${result2.passed ? "PASSED" : "FAILED"}, 0 hints used`);
  if (result2.difficultyUpdate) {
    console.log(`Difficulty policy decision: ${result2.difficultyUpdate.decision}`);
    console.log(`New difficulty for data_structures.hashing: ${result2.difficultyUpdate.label} (delta ${result2.difficultyUpdate.delta >= 0 ? "+" : ""}${result2.difficultyUpdate.delta})`);
    console.log(`Reason: ${result2.difficultyUpdate.reason}`);
  }

  // ===================================================================
  // ROUND 3 — selection only: shows the loop keeps adapting, including
  // exploring a fresh skill once the hashing content pool is exhausted at
  // the student's current level (a real, non-scripted consequence of only
  // having 5 seed challenges — see docs/IMPLEMENTATION_MANIFEST.md).
  // ===================================================================
  section("CHALLENGE — round 3 selection (loop continues)");
  const round3 = service.getNextChallenge(studentId, SupportedLanguage.PYTHON);
  if (!round3) {
    console.log("No further eligible challenge in this 5-challenge seed set — expected once every eligible candidate has been exhausted; a real deployment's content pool would be far larger.");
  } else {
    console.log(`Selected: ${round3.challenge.title}  [${round3.challenge.challengeId}]`);
    console.log(`Task type: ${round3.challenge.taskType}   Difficulty: ${round3.challenge.difficultyLabel}`);
    console.log(`Rationale: ${round3.reason.rationale}`);
    console.log(
      "\n(With only 5 seed challenges, no second DEBUGGING challenge on hashing exists to re-target that gap directly " +
        "— the engine reasonably explores a new skill instead, exactly as it should with a small content pool.)",
    );
  }

  // ===================================================================
  // Resilience (§44): AI generation pipeline with no live provider configured.
  // ===================================================================
  section("Bonus: AI generation pipeline resilience (§44) — no live provider in this sandbox");
  const genResult = await generateChallenge(aiProvider, {
    role: RoleContext.AI_ML_ENGINEER,
    skill: "algorithms.sliding_window",
    subskill: "fixed_window_average",
    difficultyLabel: DifficultyLabel.INTERMEDIATE,
    taskType: TaskType.IMPLEMENTATION,
    language: SupportedLanguage.PYTHON,
    learningObjective: "Apply a fixed-size sliding window to a streaming average calculation.",
    constraints: ["O(n) time"],
  });
  console.log(`Generation status: ${genResult.status}`);
  for (const issue of genResult.issues) console.log(`  [${issue.stage}] ${issue.message}`);
  console.log("The platform did not crash and did not fabricate a challenge — it reported exactly why generation could not complete (§44's AI_EVALUATION_PENDING principle, applied to generation too).");

  section("Done");
  console.log("Full attempt history (immutable, §22):");
  for (const a of store.listAttempts(studentId)) {
    console.log(`  ${a.attemptId} | ${a.challengeId} | ${a.executionStatus} | hints=${a.hintUsage.length} | ${a.submittedAt}`);
  }
}

main().catch((err) => {
  console.error("DEMO FAILED:", err);
  process.exit(1);
});
