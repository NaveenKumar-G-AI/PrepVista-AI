/**
 * Integration contracts with sibling ACEAPT features (§41, §80-91).
 *
 * Feature 55 does not have the real Feature 43/45/49/50/51/52/53/54 code
 * available in this environment, so every cross-feature dependency is
 * expressed as a TypeScript interface ("port") plus one concrete adapter.
 *
 * INBOUND ports (Feature 55 calls these): QualityGate (53), ValidationGate
 * (54), SkillGraphPort (45), NoveltyPort (49). Each has a SQL-backed default
 * adapter in src/integrations/*.adapter.ts that reads the stand-in columns
 * in db/reference/000_assumed_existing_schema.sql, so the whole pipeline is
 * runnable and testable end-to-end today.
 *
 * OUTBOUND ports (sibling features call Feature 55): AdaptiveSelectionPort
 * (43), SpeedTrainingPort (50), AccuracyTrainingPort (51),
 * TimedChallengePort (52). These are satisfied directly by
 * DifficultyCalibrationService — see src/integrations/outbound.ts — because
 * Feature 55 IS the implementation the other features would import; there is
 * nothing to mock on that side.
 *
 * To integrate for real: replace the *.adapter.ts file's body with a call
 * into the real Feature 45/49/53/54 module or HTTP client. Nothing else in
 * this codebase needs to change — every service depends on these interfaces,
 * never on the adapter implementations.
 */

export interface QualityVerdict {
  status: 'OK' | 'UNRESOLVED' | 'POOR';
  /** If true, Feature 53 policy says this version must NOT contribute to
   * calibration at all (§23) — distinct from just being noteworthy. */
  blocksCalibration: boolean;
}

/** Feature 53 — "Is this a good question?" (§6, §85) */
export interface QualityGate {
  getQualityVerdict(questionVersionId: string): Promise<QualityVerdict>;
}

/** Feature 54 — "Is this question objectively valid?" (§6, §86) */
export interface ValidationGate {
  isValid(questionVersionId: string): Promise<boolean>;
}

export interface SkillContext {
  skillId: string | null;
  skillName: string | null;
  prerequisiteSkillIds: string[];
}

/** Feature 45 — Aptitude Skill Graph (§41, §87) */
export interface SkillGraphPort {
  getSkillContext(questionVersionId: string): Promise<SkillContext>;
}

/** Feature 49 — novelty / exposure / familiarity per attempt (§43-45, §84) */
export interface NoveltyPort {
  classifyExposure(attempt: {
    isNovelRaw: boolean;
    exposureNumberRaw: number;
  }): { isNovel: boolean; exposureNumber: number };
}

export interface DifficultySelectionView {
  questionVersionId: string;
  category: 'EASY' | 'MEDIUM' | 'HARD' | null;
  estimate: number | null;
  status: 'PROVISIONAL' | 'CALIBRATED' | 'STALE' | 'NEEDS_REVIEW';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Surfaced explicitly so Feature 43 can apply its own judgment about
   * selection bias (§39) instead of Feature 55 silently deciding for it. */
  eligibleForAdaptiveUse: boolean;
}

/** Feature 43 — Adaptive Selection consumes calibrated difficulty (§80) */
export interface AdaptiveSelectionPort {
  getDifficultyForSelection(
    questionVersionId: string,
    populationId?: string
  ): Promise<DifficultySelectionView>;
}

export interface ExpectedTimeView {
  medianMs: number | null;
  p25Ms: number | null;
  p75Ms: number | null;
  sampleSize: number;
  reliable: boolean;
}

/** Feature 50 — Speed Training consumes expected solving time (§27, §81) */
export interface SpeedTrainingPort {
  getExpectedTime(questionVersionId: string, mode?: 'UNTIMED' | 'TIMED'): Promise<ExpectedTimeView>;
}

/** Feature 51 — Accuracy Training consumes difficulty-aware accuracy context (§82) */
export interface AccuracyTrainingPort {
  getDifficultyContext(questionVersionId: string): Promise<DifficultySelectionView>;
}

export interface TimedChallengeProfile {
  difficulty: DifficultySelectionView;
  expectedTime: ExpectedTimeView;
  timePressureSensitive: boolean; // true if TIMED estimate meaningfully harder than UNTIMED
}

/** Feature 52 — Timed Challenge consumes difficulty + time demand together (§83) */
export interface TimedChallengePort {
  getTimedChallengeProfile(questionVersionId: string): Promise<TimedChallengeProfile>;
}
