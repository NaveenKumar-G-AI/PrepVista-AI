import { test, assert, assertEqual } from "./harness.js";
import { classifyOutcome, nextDifficulty, startingDifficultyForLevel, type ChallengeOutcomeSignal } from "../src/engine/difficultyPolicy.js";
import { DifficultyLabel, SkillLevel } from "../src/domain/types.js";

const signal = (overrides: Partial<ChallengeOutcomeSignal>): ChallengeOutcomeSignal => ({
  finalStatus: "PASSED",
  totalHintsUsed: 0,
  submissionCount: 1,
  firstAttemptPassRatio: 1,
  ...overrides,
});

test("difficultyPolicy: hint-free first-try pass -> STRONG_SUCCESS, difficulty +1", () => {
  const decision = nextDifficulty(DifficultyLabel.EASY, signal({}), []);
  assertEqual(decision.decision, "STRONG_SUCCESS");
  assertEqual(decision.label, DifficultyLabel.INTERMEDIATE);
  assertEqual(decision.delta, 1);
});

test("difficultyPolicy: two prior hint-free passes + a third -> REPEATED_STRONG_SUCCESS, difficulty +2", () => {
  const prior = [signal({}), signal({})];
  const decision = nextDifficulty(DifficultyLabel.EASY, signal({}), prior);
  assertEqual(decision.decision, "REPEATED_STRONG_SUCCESS");
  assertEqual(decision.delta, 2);
});

test("difficultyPolicy: pass with 1 hint but strong first attempt -> NORMAL_SUCCESS, difficulty +1", () => {
  const decision = nextDifficulty(DifficultyLabel.INTERMEDIATE, signal({ totalHintsUsed: 1, submissionCount: 2, firstAttemptPassRatio: 0.8 }), []);
  assertEqual(decision.decision, "NORMAL_SUCCESS");
  assertEqual(decision.delta, 1);
});

test("difficultyPolicy: pass with 1 hint and weak first attempt -> NORMAL_SUCCESS, difficulty held", () => {
  const decision = nextDifficulty(DifficultyLabel.INTERMEDIATE, signal({ totalHintsUsed: 1, submissionCount: 3, firstAttemptPassRatio: 0.3 }), []);
  assertEqual(decision.decision, "NORMAL_SUCCESS");
  assertEqual(decision.delta, 0);
});

test("difficultyPolicy: pass with 3+ hints -> SUCCESS_WITH_HEAVY_HINTS, difficulty held", () => {
  const decision = nextDifficulty(DifficultyLabel.INTERMEDIATE, signal({ totalHintsUsed: 3, submissionCount: 2, firstAttemptPassRatio: 0.5 }), []);
  assertEqual(decision.decision, "SUCCESS_WITH_HEAVY_HINTS");
  assertEqual(decision.delta, 0);
});

test("difficultyPolicy: first failure on a skill -> FAILURE, difficulty held (issue type decides next content, not difficulty)", () => {
  const decision = nextDifficulty(DifficultyLabel.INTERMEDIATE, signal({ finalStatus: "FAILED" }), []);
  assertEqual(decision.decision, "FAILURE");
  assertEqual(decision.delta, 0);
});

test("difficultyPolicy: failure preceded by a recent failure on the same skill -> REPEATED_FAILURE, difficulty -1", () => {
  const prior = [signal({ finalStatus: "FAILED" })];
  const decision = nextDifficulty(DifficultyLabel.INTERMEDIATE, signal({ finalStatus: "FAILED" }), prior);
  assertEqual(decision.decision, "REPEATED_FAILURE");
  assertEqual(decision.delta, -1);
});

test("difficultyPolicy: difficulty never goes below FOUNDATION", () => {
  const prior = [signal({ finalStatus: "FAILED" })];
  const decision = nextDifficulty(DifficultyLabel.FOUNDATION, signal({ finalStatus: "FAILED" }), prior);
  assertEqual(decision.label, DifficultyLabel.FOUNDATION);
});

test("difficultyPolicy: difficulty never exceeds EXPERT", () => {
  const prior = [signal({}), signal({})];
  const decision = nextDifficulty(DifficultyLabel.EXPERT, signal({}), prior);
  assertEqual(decision.label, DifficultyLabel.EXPERT);
});

test("startingDifficultyForLevel: maps every SkillLevel to a valid label", () => {
  assertEqual(startingDifficultyForLevel(SkillLevel.WEAK), DifficultyLabel.FOUNDATION);
  assertEqual(startingDifficultyForLevel(SkillLevel.DEVELOPING), DifficultyLabel.EASY);
  assertEqual(startingDifficultyForLevel(SkillLevel.PROFICIENT), DifficultyLabel.INTERMEDIATE);
  assertEqual(startingDifficultyForLevel(SkillLevel.STRONG), DifficultyLabel.ADVANCED);
});

test("classifyOutcome: ABANDONED with no prior failures is a plain FAILURE, not REPEATED", () => {
  assertEqual(classifyOutcome(signal({ finalStatus: "ABANDONED" }), []), "FAILURE");
});
