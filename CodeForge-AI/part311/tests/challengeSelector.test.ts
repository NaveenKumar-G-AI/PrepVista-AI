import { test, assert, assertEqual } from "./harness.js";
import { eligibleCandidates, rankCandidates, selectNextChallenge, type SelectorInput } from "../src/engine/challengeSelector.js";
import { analyzeSkillGaps } from "../src/engine/skillGapAnalyzer.js";
import {
  ChallengeLifecycleStatus,
  DifficultyLabel,
  ProgressionStage,
  RoleContext,
  SkillLevel,
  SupportedLanguage,
  TaskType,
  TestCategory,
  type Challenge,
  type StudentProfile,
} from "../src/domain/types.js";

function makeChallenge(overrides: Partial<Challenge> & Pick<Challenge, "challengeId" | "skill">): Challenge {
  return {
    version: 1,
    title: overrides.challengeId,
    description: "test challenge",
    roleContext: [RoleContext.GENERAL_SWE],
    subskill: "generic",
    competencies: [],
    prerequisites: [],
    difficulty: { conceptualComplexity: 2, implementationComplexity: 2, reasoningComplexity: 2, edgeCaseComplexity: 2, prerequisiteDepth: 1, expectedTimeMinutes: 10, calibrated: false },
    difficultyLabel: DifficultyLabel.EASY,
    progressionStage: ProgressionStage.BASIC_APPLICATION,
    taskType: TaskType.IMPLEMENTATION,
    supportedLanguages: [SupportedLanguage.PYTHON],
    learningObjective: "test",
    constraints: [],
    examples: [],
    starterCode: {},
    publicTests: [{ id: "p1", category: TestCategory.NORMAL, input: [1], expectedOutput: 1, hidden: false, points: 1 }],
    hiddenTests: [],
    hints: ["hint"],
    solutionMetadata: { referenceSolution: {}, approachSummary: "" },
    evaluationMetadata: { entryFunction: "solve", comparisonMode: "exact" },
    qualityStatus: ChallengeLifecycleStatus.ACTIVE,
    qualityAnalytics: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return { studentId: "s1", targetRole: RoleContext.AI_ML_ENGINEER, skills: {}, exposureHistory: [], ...overrides };
}

function baseInput(overrides: Partial<SelectorInput>): SelectorInput {
  const profile = overrides.profile ?? makeProfile();
  return {
    profile,
    candidates: [],
    gaps: analyzeSkillGaps(profile),
    recommendedDifficultyForSkill: () => DifficultyLabel.EASY,
    language: SupportedLanguage.PYTHON,
    ...overrides,
  };
}

test("selector: a challenge with an unmet prerequisite is excluded", () => {
  const advanced = makeChallenge({ challengeId: "advanced", skill: "algorithms.searching", prerequisites: ["algorithms.dynamic_programming"] });
  const profile = makeProfile({ skills: {} }); // no evidence anywhere -> prerequisite unmet
  const eligible = eligibleCandidates(baseInput({ profile, candidates: [advanced] }));
  assertEqual(eligible.length, 0);
});

test("selector: a challenge whose prerequisite IS met is included", () => {
  const advanced = makeChallenge({ challengeId: "advanced", skill: "algorithms.searching", prerequisites: ["data_structures.arrays"] });
  const profile = makeProfile({
    skills: { "data_structures.arrays": { skill: "data_structures.arrays", level: SkillLevel.PROFICIENT, currentDifficultyLabel: DifficultyLabel.EASY, evidence: [], lastUpdated: "2026-01-01T00:00:00.000Z" } },
  });
  const eligible = eligibleCandidates(baseInput({ profile, candidates: [advanced] }));
  assertEqual(eligible.length, 1);
});

test("selector: a challenge in a non-runnable language is excluded", () => {
  const javaOnly = makeChallenge({ challengeId: "java-only", skill: "fundamentals.functions", supportedLanguages: [SupportedLanguage.JAVASCRIPT] });
  const eligible = eligibleCandidates(baseInput({ candidates: [javaOnly], language: SupportedLanguage.PYTHON }));
  assertEqual(eligible.length, 0);
});

test("selector: DRAFT/REVIEW challenges never reach eligibility", () => {
  const draft = makeChallenge({ challengeId: "draft-one", skill: "fundamentals.functions", qualityStatus: ChallengeLifecycleStatus.DRAFT });
  const review = makeChallenge({ challengeId: "review-one", skill: "fundamentals.functions", qualityStatus: ChallengeLifecycleStatus.REVIEW });
  const eligible = eligibleCandidates(baseInput({ candidates: [draft, review] }));
  assertEqual(eligible.length, 0);
});

test("selector: prioritizes the weaker skill over a stronger one, all else equal", () => {
  const weakChallenge = makeChallenge({ challengeId: "on-weak-skill", skill: "engineering.debugging" });
  const strongChallenge = makeChallenge({ challengeId: "on-strong-skill", skill: "data_structures.arrays" });
  const profile = makeProfile({
    skills: {
      "engineering.debugging": { skill: "engineering.debugging", level: SkillLevel.WEAK, currentDifficultyLabel: DifficultyLabel.EASY, evidence: [], lastUpdated: "2026-01-01T00:00:00.000Z" },
      "data_structures.arrays": { skill: "data_structures.arrays", level: SkillLevel.STRONG, currentDifficultyLabel: DifficultyLabel.EASY, evidence: [], lastUpdated: "2026-01-01T00:00:00.000Z" },
    },
  });
  const winner = selectNextChallenge(baseInput({ profile, candidates: [weakChallenge, strongChallenge] }));
  assertEqual(winner?.challenge.challengeId, "on-weak-skill");
});

test("selector: role-matched challenge outranks a role-irrelevant one, all else equal", () => {
  const matched = makeChallenge({ challengeId: "role-match", skill: "data_structures.hashing", roleContext: [RoleContext.AI_ML_ENGINEER] });
  const unmatched = makeChallenge({ challengeId: "role-mismatch", skill: "data_structures.hashing", roleContext: [RoleContext.FRONTEND_ENGINEER] });
  const winner = selectNextChallenge(baseInput({ candidates: [matched, unmatched] }));
  assertEqual(winner?.challenge.challengeId, "role-match");
});

test("selector: exact repeat of the most recently seen challenge is heavily suppressed vs. an alternative", () => {
  const seen = makeChallenge({ challengeId: "seen-already", skill: "data_structures.hashing" });
  const fresh = makeChallenge({ challengeId: "not-seen-yet", skill: "data_structures.hashing" });
  const profile = makeProfile({
    exposureHistory: [{ challengeId: "seen-already", skill: "data_structures.hashing", subskill: "x", taskType: TaskType.IMPLEMENTATION, roleContext: RoleContext.AI_ML_ENGINEER, timestamp: "2026-01-01T00:00:00.000Z" }],
  });
  const winner = selectNextChallenge(baseInput({ profile, candidates: [seen, fresh] }));
  assertEqual(winner?.challenge.challengeId, "not-seen-yet");
});

test("selector: same-skill-different-task-type outranks same-skill-same-task-type immediately after exposure", () => {
  const sameTaskType = makeChallenge({ challengeId: "same-tt", skill: "data_structures.hashing", taskType: TaskType.IMPLEMENTATION });
  const differentTaskType = makeChallenge({ challengeId: "diff-tt", skill: "data_structures.hashing", taskType: TaskType.DEBUGGING });
  const profile = makeProfile({
    exposureHistory: [{ challengeId: "prior-one", skill: "data_structures.hashing", subskill: "x", taskType: TaskType.IMPLEMENTATION, roleContext: RoleContext.AI_ML_ENGINEER, timestamp: "2026-01-01T00:00:00.000Z" }],
  });
  const ranked = rankCandidates(baseInput({ profile, candidates: [sameTaskType, differentTaskType] }));
  assertEqual(ranked[0]!.challenge.challengeId, "diff-tt");
});

test("selector: with no eligible candidates, returns null rather than throwing", () => {
  const result = selectNextChallenge(baseInput({ candidates: [] }));
  assertEqual(result, null);
});

test("selector: SelectionReason score is always within [0, 1]", () => {
  const c = makeChallenge({ challengeId: "bounds-check", skill: "data_structures.hashing" });
  const ranked = rankCandidates(baseInput({ candidates: [c] }));
  assert(ranked[0]!.reason.score >= 0 && ranked[0]!.reason.score <= 1, `score out of bounds: ${ranked[0]!.reason.score}`);
});
