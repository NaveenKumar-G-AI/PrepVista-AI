/**
 * CodeForge — Service Layer (§46)
 *
 * getNextChallenge · getChallenge · startAttempt · saveDraft · submitAttempt ·
 * requestHint
 *
 * This is the one place that orchestrates every other module. It also owns
 * the two redaction boundaries §43 cares about: PublicChallengeView never
 * includes hidden tests or the reference solution, and hidden TestResults
 * never carry actual/expected values (enforced upstream in executor.ts, kept
 * that way here too).
 */

import {
  ExecutionStatus,
  SkillLevel,
  SupportedLanguage,
  TaskType,
  type Attempt,
  type Challenge,
  type ChallengeExample,
  type DifficultyLabel,
  type MistakeCategory,
  type RoleContext,
  type SelectionReason,
  type StudentProfile,
  type TestCase,
  type TestResult,
} from "../domain/types.js";
import { InMemoryStore } from "../store/store.js";
import type { AIProvider } from "../ai/aiProvider.js";
import { analyzeSkillGaps, recomputeSkillLevel } from "../engine/skillGapAnalyzer.js";
import { selectNextChallenge, type SelectorInput } from "../engine/challengeSelector.js";
import { classifyOutcome, nextDifficulty, startingDifficultyForLevel, type ChallengeOutcomeSignal, type DifficultyDecision } from "../engine/difficultyPolicy.js";
import { classifyMistakes, updateMisconceptions } from "../engine/mistakeClassifier.js";
import { getHint, nextHintLevel, type HintResult } from "../engine/hintService.js";
import { runAIEvaluation, runDeterministicEvaluation } from "../evaluation/evaluationService.js";

// ---------------------------------------------------------------------------
// Public (redacted) views — §43: hidden tests and solutions never leave the service.
// ---------------------------------------------------------------------------

export interface PublicTestCaseView {
  id: string;
  category: TestCase["category"];
  input: unknown[];
  expectedOutput: unknown;
}

export interface PublicChallengeView {
  challengeId: string;
  version: number;
  title: string;
  description: string;
  difficultyLabel: DifficultyLabel;
  taskType: TaskType;
  supportedLanguages: SupportedLanguage[];
  constraints: string[];
  examples: ChallengeExample[];
  starterCode: Partial<Record<SupportedLanguage, string>>;
  publicTests: PublicTestCaseView[];
  hiddenTestCount: number;
}

export function toPublicView(challenge: Challenge): PublicChallengeView {
  return {
    challengeId: challenge.challengeId,
    version: challenge.version,
    title: challenge.title,
    description: challenge.description,
    difficultyLabel: challenge.difficultyLabel,
    taskType: challenge.taskType,
    supportedLanguages: challenge.supportedLanguages,
    constraints: challenge.constraints,
    examples: challenge.examples,
    starterCode: challenge.starterCode,
    publicTests: challenge.publicTests.map((t) => ({ id: t.id, category: t.category, input: t.input, expectedOutput: t.expectedOutput })),
    hiddenTestCount: challenge.hiddenTests.length,
  };
}

// ---------------------------------------------------------------------------
// §33 — evidence-based failure summary, generated from real counts, not a canned string.
// ---------------------------------------------------------------------------

export function summarizeFailures(testResults: TestResult[]): string {
  const failed = testResults.filter((r) => !r.passed);
  if (failed.length === 0) return "All validation cases passed.";
  const total = testResults.length;
  const passedCount = total - failed.length;
  const categories = Array.from(new Set(failed.map((f) => f.category)));
  const categoryLabel =
    categories.length === 1 ? `${categories[0]!.toLowerCase()} case${failed.length > 1 ? "s" : ""}` : "cases spanning multiple categories";
  const verb = failed.length > 1 ? "are" : "is";
  return `Your implementation handles ${passedCount} of ${total} test cases, but ${failed.length} ${categoryLabel} still ${verb} failing.`;
}

// ---------------------------------------------------------------------------
// Task types that also credit a cross-cutting engineering skill in addition to
// the challenge's primary content skill — a DEBUGGING challenge about hashing
// is real evidence for BOTH data_structures.hashing and engineering.debugging.
// ---------------------------------------------------------------------------

const TASK_TYPE_CROSS_CREDIT: Partial<Record<TaskType, string>> = {
  [TaskType.DEBUGGING]: "engineering.debugging",
  [TaskType.TEST_CREATION]: "engineering.testing",
  [TaskType.OPTIMIZATION]: "engineering.performance",
};

export interface SubmitResult {
  attempt: Attempt;
  passed: boolean;
  testsPassed: number;
  testsTotal: number;
  failureSummary: string;
  mistakeCategories: MistakeCategory[];
  /** Only populated when this submission resolved (passed) the challenge — §14 fires once per resolved sequence, not per submission. */
  difficultyUpdate: DifficultyDecision | null;
}

export class CodeForgeService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly aiProvider: AIProvider,
  ) {}

  // --- profile bootstrap ----------------------------------------------------

  ensureProfile(studentId: string, targetRole: RoleContext): StudentProfile {
    let profile = this.store.getProfile(studentId);
    if (!profile) {
      profile = { studentId, targetRole, skills: {}, exposureHistory: [] };
      this.store.saveProfile(profile);
    }
    return profile;
  }

  /** Establishes a baseline skill level from e.g. an onboarding assessment — not something a student calls mid-session. */
  seedSkillBaseline(studentId: string, skill: string, level: SkillLevel): void {
    const profile = this.requireProfile(studentId);
    profile.skills[skill] = {
      skill,
      level,
      currentDifficultyLabel: startingDifficultyForLevel(level),
      evidence: [],
      lastUpdated: new Date().toISOString(),
    };
    this.store.saveProfile(profile);
  }

  // --- §46 API surface --------------------------------------------------------

  getNextChallenge(studentId: string, language: SupportedLanguage = SupportedLanguage.PYTHON): { challenge: PublicChallengeView; reason: SelectionReason } | null {
    const profile = this.requireProfile(studentId);
    const misconceptions = this.store.getMisconceptions(studentId);
    const gaps = analyzeSkillGaps(profile, misconceptions);

    const recommendedDifficultyForSkill = (skill: string): DifficultyLabel => {
      const state = profile.skills[skill];
      if (state) return state.currentDifficultyLabel;
      const gap = gaps.find((g) => g.skill === skill);
      return startingDifficultyForLevel(gap?.level ?? SkillLevel.WEAK);
    };

    const input: SelectorInput = {
      profile,
      candidates: this.store.listActiveChallenges(),
      gaps,
      recommendedDifficultyForSkill,
      language,
    };
    const result = selectNextChallenge(input);
    if (!result) return null;
    return { challenge: toPublicView(result.challenge), reason: result.reason };
  }

  getChallenge(challengeId: string): PublicChallengeView {
    return toPublicView(this.requireChallenge(challengeId));
  }

  startAttempt(studentId: string, challengeId: string, language: SupportedLanguage): { attemptId: string; starterCode: string } {
    this.requireProfile(studentId);
    const challenge = this.requireChallenge(challengeId);
    const starterCode = challenge.starterCode[language] ?? "";
    const attemptId = `att_${studentId}_${challengeId}_${this.store.listAttempts(studentId, challengeId).length + 1}`;
    const now = new Date().toISOString();
    const attempt: Attempt = {
      attemptId,
      studentId,
      challengeId,
      challengeVersion: challenge.version,
      language,
      code: starterCode,
      startedAt: now,
      submittedAt: null,
      executionStatus: ExecutionStatus.STARTED,
      deterministicEvaluation: null,
      aiEvaluation: null,
      mistakeCategories: [],
      hintUsage: [],
      aiAssistanceUsed: false,
    };
    this.store.createAttempt(attempt);
    return { attemptId, starterCode };
  }

  saveDraft(attemptId: string, code: string): void {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.submittedAt) throw new Error("cannot edit an already-submitted attempt");
    this.store.updateAttempt(attemptId, { code, executionStatus: ExecutionStatus.DRAFT });
  }

  requestHint(attemptId: string, level?: number): HintResult {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.submittedAt) throw new Error("cannot request a hint on an already-submitted attempt");
    const challenge = this.requireChallenge(attempt.challengeId);
    const targetLevel = level ?? nextHintLevel(attempt.hintUsage.map((h) => h.level));
    const hint = getHint(challenge, targetLevel);
    this.store.updateAttempt(attemptId, {
      hintUsage: [...attempt.hintUsage, { level: hint.level, requestedAt: new Date().toISOString() }],
      aiAssistanceUsed: true,
    });
    return hint;
  }

  async submitAttempt(attemptId: string, code: string): Promise<SubmitResult> {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.submittedAt) throw new Error(`attempt ${attemptId} was already submitted`);
    const challenge = this.requireChallenge(attempt.challengeId);
    const profile = this.requireProfile(attempt.studentId);

    // §24/§25 — deterministic first and final; AI is additive and never touches this result.
    const deterministic = runDeterministicEvaluation(challenge, attempt.language, code, true);
    const mistakeCategories = classifyMistakes(deterministic.testResults);
    const aiEvaluation = await runAIEvaluation(this.aiProvider, challenge, attempt.language, code, deterministic, mistakeCategories);

    const submittedAt = new Date().toISOString();
    const finalized = this.store.updateAttempt(attemptId, {
      code,
      submittedAt,
      executionStatus: deterministic.status,
      deterministicEvaluation: deterministic,
      aiEvaluation,
      mistakeCategories,
    });

    this.updateProfileFromAttempt(profile, challenge, finalized, mistakeCategories);
    this.store.recordChallengeOutcome(challenge.challengeId, {
      passed: deterministic.status === ExecutionStatus.PASSED,
      hintsUsed: finalized.hintUsage.length,
      completionMs: deterministic.runtimeMs,
      systemError: deterministic.status === ExecutionStatus.SYSTEM_ERROR,
      abandoned: false,
    });

    let difficultyUpdate: DifficultyDecision | null = null;
    if (deterministic.status === ExecutionStatus.PASSED) {
      difficultyUpdate = this.resolveDifficultyForSkill(profile, challenge);
    }

    return {
      attempt: finalized,
      passed: deterministic.status === ExecutionStatus.PASSED,
      testsPassed: deterministic.testsPassed,
      testsTotal: deterministic.testResults.length,
      failureSummary: summarizeFailures(deterministic.testResults),
      mistakeCategories,
      difficultyUpdate,
    };
  }

  // --- profile/evidence update (the "Profile Update" step of the master loop) -----

  private updateProfileFromAttempt(profile: StudentProfile, challenge: Challenge, attempt: Attempt, mistakeCategories: MistakeCategory[]): void {
    const outcome: "PASSED" | "FAILED" | "PARTIAL" =
      attempt.executionStatus === ExecutionStatus.PASSED ? "PASSED" : (attempt.deterministicEvaluation?.testsPassed ?? 0) > 0 ? "PARTIAL" : "FAILED";
    const timestamp = attempt.submittedAt!;

    const skillsToCredit = new Set([challenge.skill]);
    const crossCredit = TASK_TYPE_CROSS_CREDIT[challenge.taskType];
    if (crossCredit) skillsToCredit.add(crossCredit);

    let misconceptions = this.store.getMisconceptions(profile.studentId);

    for (const skillKey of skillsToCredit) {
      const existing = profile.skills[skillKey] ?? {
        skill: skillKey,
        level: SkillLevel.WEAK,
        currentDifficultyLabel: startingDifficultyForLevel(SkillLevel.WEAK),
        evidence: [],
        lastUpdated: timestamp,
      };
      const evidence = [{ attemptId: attempt.attemptId, challengeId: challenge.challengeId, timestamp, outcome, hintsUsed: attempt.hintUsage.length, mistakeCategories }, ...existing.evidence].slice(0, 20);
      const newLevel = recomputeSkillLevel(existing.level, evidence);
      profile.skills[skillKey] = { ...existing, level: newLevel, evidence, lastUpdated: timestamp };

      for (const category of mistakeCategories) {
        misconceptions = updateMisconceptions(misconceptions, profile.studentId, skillKey, category, { attemptId: attempt.attemptId, detail: `${category} on ${challenge.challengeId} (${challenge.taskType})` }, timestamp);
      }
    }
    this.store.setMisconceptions(profile.studentId, misconceptions);

    profile.exposureHistory = [
      { challengeId: challenge.challengeId, skill: challenge.skill, subskill: challenge.subskill, taskType: challenge.taskType, roleContext: profile.targetRole, timestamp },
      ...profile.exposureHistory,
    ].slice(0, 30);

    this.store.saveProfile(profile);
  }

  // --- §14 difficulty resolution — fires once per RESOLVED challenge sequence -----

  private resolveDifficultyForSkill(profile: StudentProfile, challenge: Challenge): DifficultyDecision {
    const skillState = profile.skills[challenge.skill]!;
    const sequence = this.store.listAttempts(profile.studentId, challenge.challengeId).filter((a) => a.submittedAt);
    const chronological = [...sequence].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    const first = chronological[0]!;
    const totalHintsUsed = chronological.reduce((sum, a) => sum + a.hintUsage.length, 0);
    const firstAttemptPassRatio = first.deterministicEvaluation ? first.deterministicEvaluation.testsPassed / Math.max(1, first.deterministicEvaluation.testResults.length) : 0;

    const signal: ChallengeOutcomeSignal = {
      finalStatus: "PASSED",
      totalHintsUsed,
      submissionCount: chronological.length,
      firstAttemptPassRatio,
    };

    const recentSameSkill = this.recentResolvedSignalsForSkill(profile.studentId, challenge.skill, challenge.challengeId);
    const decision = nextDifficulty(skillState.currentDifficultyLabel, signal, recentSameSkill);

    profile.skills[challenge.skill] = { ...skillState, currentDifficultyLabel: decision.label };
    this.store.saveProfile(profile);
    return decision;
  }

  private recentResolvedSignalsForSkill(studentId: string, skill: string, excludeChallengeId: string): ChallengeOutcomeSignal[] {
    const bySequence = new Map<string, Attempt[]>();
    for (const a of this.store.listAttempts(studentId)) {
      if (!a.submittedAt || a.challengeId === excludeChallengeId) continue;
      const c = this.store.getChallenge(a.challengeId);
      if (!c || c.skill !== skill) continue;
      if (!bySequence.has(a.challengeId)) bySequence.set(a.challengeId, []);
      bySequence.get(a.challengeId)!.push(a);
    }
    const withTimestamp: { signal: ChallengeOutcomeSignal; lastTimestamp: string }[] = [];
    for (const attempts of bySequence.values()) {
      const chronological = [...attempts].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
      const first = chronological[0]!;
      const last = chronological[chronological.length - 1]!;
      const firstAttemptPassRatio = first.deterministicEvaluation ? first.deterministicEvaluation.testsPassed / Math.max(1, first.deterministicEvaluation.testResults.length) : 0;
      withTimestamp.push({
        signal: {
          finalStatus: last.executionStatus === ExecutionStatus.PASSED ? "PASSED" : "FAILED",
          totalHintsUsed: chronological.reduce((s, a) => s + a.hintUsage.length, 0),
          submissionCount: chronological.length,
          firstAttemptPassRatio,
        },
        lastTimestamp: last.submittedAt!,
      });
    }
    return withTimestamp.sort((a, b) => (a.lastTimestamp < b.lastTimestamp ? 1 : -1)).map((w) => w.signal);
  }

  // --- lookups ----------------------------------------------------------------

  private requireProfile(studentId: string): StudentProfile {
    const p = this.store.getProfile(studentId);
    if (!p) throw new Error(`no profile for student '${studentId}' — call ensureProfile() first`);
    return p;
  }

  private requireChallenge(challengeId: string): Challenge {
    const c = this.store.getChallenge(challengeId);
    if (!c) throw new Error(`no challenge '${challengeId}'`);
    return c;
  }

  private requireAttempt(attemptId: string): Attempt {
    const a = this.store.getAttempt(attemptId);
    if (!a) throw new Error(`no attempt '${attemptId}'`);
    return a;
  }
}
