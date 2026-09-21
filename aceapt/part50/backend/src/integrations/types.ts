// Integration seams for Features 42-49 + mastery/readiness/auth.
//
// No existing ACEAPT repository was available in this environment to
// inspect (see IMPLEMENTATION_REPORT.md). Rather than duplicate or guess at
// those systems, Feature 50 depends only on these interfaces. Wire real
// implementations in once this module is dropped into the main backend -
// nothing else in Feature 50 needs to change (see defaultProviders.ts for
// the safe placeholder implementations used until then).

import { NoveltyLevel, QuestionContext, StageTimings } from '../types/domain';

export interface DifficultyCalibrationProvider {
  /** Features 42/43: calibrated expected time for a question, if the
   * platform has calibration data. Returning null is expected and safe -
   * Feature 50 falls back to the student's own baseline rather than guessing. */
  getExpectedTimeMs(question: QuestionContext): Promise<number | null>;
}

export type MasteryLevel = 'NOT_STARTED' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERED';

export interface MasteryProvider {
  /** Existing mastery/readiness system: current mastery for a skill, used to
   * avoid pushing high speed pressure on an unmastered concept (spec 43, 97). */
  getMasteryLevel(studentId: string, skillId: string): Promise<MasteryLevel | null>;
}

export interface GoalContext {
  goalId: string;
  targetSkillIds: string[];
  deadline?: string;
}

export interface GoalProvider {
  /** Feature 44: the active goal, used to prioritize which skills speed
   * training should focus on (spec 48, 94). */
  getActiveGoal(studentId: string): Promise<GoalContext | null>;
}

export interface SkillGraphProvider {
  /** Feature 45: shared foundational skills, so a slow point that's really a
   * shared prerequisite can be surfaced instead of duplicated per-skill (spec 47). */
  getRelatedFoundationalSkills(skillId: string): Promise<string[]>;
}

export interface NoveltyProvider {
  /** Feature 49: whether a question is familiar/transfer/novel for this
   * student, so fluency claims aren't based on memorized patterns (spec 44, 99, 104). */
  getNoveltyLevel(studentId: string, questionId: string): Promise<NoveltyLevel | null>;
}

export interface GuidedSolvingProvider {
  /** Feature 47: step-level timing, when instrumented. Returning null is
   * expected when the guided-solving flow wasn't used (spec 46, 101). */
  getStageTimings(studentId: string, attemptContext: { questionId: string; sessionId: string }): Promise<StageTimings | null>;
}

export interface HintProvider {
  /** Feature 48: hint level used on an attempt, so assisted time is analyzed
   * separately from independent speed (spec 45, 100, 116). */
  getHintLevel(studentId: string, questionId: string, sessionId: string): Promise<number>;
}

export interface ReadinessSpeedSignal {
  studentId: string;
  scopeSkillId: string;
  timeEfficiency: number; // 0-1
  speedUnderPressure: number; // 0-1
  accuracyUnderPressure: number; // 0-1
  pacingQuality: number; // 0-1
  decisionQuality: number; // 0-1
}

export interface ReadinessSink {
  /** Sends speed evidence INTO the existing readiness calculation - Feature
   * 50 never recomputes readiness itself (spec 95). */
  reportSpeedSignal(signal: ReadinessSpeedSignal): Promise<void>;
}

export interface AuthorizationProvider {
  /** Trainer/TPO role check for cohort-level analytics (spec 78, 106-107). */
  canViewCohortAnalytics(userId: string, cohortId: string): Promise<boolean>;
}

export interface IntegrationProviders {
  difficulty: DifficultyCalibrationProvider;
  mastery: MasteryProvider;
  goals: GoalProvider;
  skillGraph: SkillGraphProvider;
  novelty: NoveltyProvider;
  guidedSolving: GuidedSolvingProvider;
  hints: HintProvider;
  readiness: ReadinessSink;
  authorization: AuthorizationProvider;
}
