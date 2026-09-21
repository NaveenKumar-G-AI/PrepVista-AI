import type { ErrorType } from "./errorTaxonomy.js";
import type { AttemptRecord } from "./accuracy.js";

/**
 * Integration seams for capabilities the spec says Feature 51 must REUSE,
 * not rebuild (§7, §76–83): mistake classification, the skill graph,
 * personal mistake bank, error-pattern intelligence, formula intelligence,
 * hint intelligence, anti-memorization/novelty, and speed/pace.
 *
 * §146 (pre-coding report) explains why these are named by CAPABILITY here
 * rather than by feature number: this module has no ACEAPT repository to
 * inspect, and the feature numbers referenced across different build
 * sessions for this product have not lined up 1:1 in this project's own
 * history. A capability-shaped interface is the reusable contract either
 * way — wire the real service in as the implementation and the feature
 * number it happens to carry becomes irrelevant to Feature 51's code.
 *
 * Each interface below ships with ONE default/reference implementation in
 * src/ports/defaultAdapters.ts, so the module runs standalone. Replace the
 * adapter, not the port, when wiring in the real service.
 */

/** Stands in for Mistake Intelligence / Classification (spec calls it F13/14). */
export interface MistakeClassificationPort {
  classify(input: {
    isCorrect: boolean;
    submittedAnswer: unknown;
    correctAnswer: unknown;
    stepResults?: Array<{ step: number; correct: boolean }> | null;
  }): Promise<ErrorType | null>; // null when isCorrect is true
}

/** Stands in for the Aptitude Skill Graph (spec calls it F45). */
export interface SkillGraphPort {
  getRelated(skillId: string): Promise<{ prerequisites: string[]; downstream: string[] }>;
}

/** Stands in for the Personal Mistake Bank (spec calls it F29 in this document). */
export interface PersonalMistakeBankPort {
  getRecentErrorTypeCounts(
    studentId: string,
    skillId: string | null,
    windowSize: number
  ): Promise<Record<ErrorType, number>>;
}

/** Stands in for Error Pattern Intelligence (spec calls it F30 in this document). */
export interface ErrorPatternIntelligencePort {
  /** Best-effort grouping of recent errors into a named cluster, e.g. "PERCENTAGE_ACCURACY_CLUSTER" (§13). */
  findCluster(recentErrors: AttemptRecord[]): Promise<{ clusterName: string; memberErrorTypes: ErrorType[] } | null>;
}

/** Stands in for Formula Intelligence (spec calls it F31 in this document). */
export interface FormulaIntelligencePort {
  getFormulaMeta(skillId: string): Promise<{ formulaName: string; conditions: string[] } | null>;
}

/** Stands in for Hint Intelligence (F48). Only consulted when a submission omits hintLevel. */
export interface HintIntelligencePort {
  resolveHintLevel(studentId: string, questionId: string): Promise<"independent" | "guided" | "hint_used">;
}

/** Stands in for Anti-Memorization / novelty (F49). Only consulted when a submission omits isNovel. */
export interface AntiMemorizationPort {
  resolveIsNovel(studentId: string, questionId: string): Promise<boolean>;
}

/** Stands in for Speed Training (F50). Only consulted when a submission omits expectedTimeMs. */
export interface SpeedTrainingPort {
  getExpectedTimeMs(skillId: string, difficulty: "easy" | "medium" | "hard"): Promise<number>;
  /** True once a student's recent pace has been pushed meaningfully below their baseline. */
  isUnderPressure(studentId: string, skillId: string): Promise<boolean>;
}

export interface PortRegistry {
  mistakeClassification: MistakeClassificationPort;
  skillGraph: SkillGraphPort;
  personalMistakeBank: PersonalMistakeBankPort;
  errorPatternIntelligence: ErrorPatternIntelligencePort;
  formulaIntelligence: FormulaIntelligencePort;
  hintIntelligence: HintIntelligencePort;
  antiMemorization: AntiMemorizationPort;
  speedTraining: SpeedTrainingPort;
}
