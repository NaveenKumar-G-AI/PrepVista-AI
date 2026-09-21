import type { DB } from '../db/client.js';
import { config } from '../config/index.js';
import { computeMastery, computeConfidence, computeTrend, detectContradiction, filterAlgorithmicEvidence } from './estimators.js';
import { EvidenceService } from '../evidence/evidenceService.js';
import { SkillGraphService } from '../skillgraph/skillGraphService.js';
import type { MasteryState, StudentSkillState } from '../types.js';

interface StateRow {
  student_id: string; skill_id: string; mastery_score: number; confidence_score: number; mastery_state: string;
  trend: string; evidence_count: number; independent_success_count: number; distinct_challenges_count: number;
  contradiction_flag: number; mastery_verified: number; last_assessed_at: string | null; next_review_at: string | null;
}

function toState(r: StateRow): StudentSkillState {
  return {
    studentId: r.student_id, skillId: r.skill_id, masteryScore: r.mastery_score, confidenceScore: r.confidence_score,
    masteryState: r.mastery_state as MasteryState, trend: r.trend as StudentSkillState['trend'],
    evidenceCount: r.evidence_count, independentSuccessCount: r.independent_success_count,
    distinctChallengesCount: r.distinct_challenges_count, contradictionFlag: Boolean(r.contradiction_flag),
    masteryVerified: Boolean(r.mastery_verified), lastAssessedAt: r.last_assessed_at, nextReviewAt: r.next_review_at,
  };
}

/**
 * Maps (score, evidenceCount, independentSuccesses, confidence, distinct
 * challenges/difficulty, verified) -> a MasteryState, enforcing the gates in
 * config so that a single lucky attempt can never reach a high state
 * (directly answers the Phase 62 review question).
 */
export function deriveMasteryState(input: {
  masteryScore: number; evidenceCount: number; independentSuccessCount: number;
  confidenceScore: number; distinctChallengesCount: number; distinctDifficultyLevels: number; verified: boolean;
}): MasteryState {
  const { masteryScore, evidenceCount, independentSuccessCount, confidenceScore, distinctChallengesCount, distinctDifficultyLevels, verified } = input;
  const t = config.mastery.stateScoreThresholds;
  const g = config.mastery.stateGates;

  if (evidenceCount === 0) return 'UNKNOWN';

  if (masteryScore >= t.MASTERED && evidenceCount >= g.MASTERED.minEvidenceCount && independentSuccessCount >= g.MASTERED.minIndependentSuccesses
    && confidenceScore >= g.MASTERED.minConfidence && distinctChallengesCount >= g.MASTERED.minDistinctChallenges && verified) {
    return 'MASTERED';
  }
  if (masteryScore >= t.ADVANCED && evidenceCount >= g.ADVANCED.minEvidenceCount && independentSuccessCount >= g.ADVANCED.minIndependentSuccesses
    && confidenceScore >= g.ADVANCED.minConfidence && distinctDifficultyLevels >= g.ADVANCED.minDistinctDifficultyLevels) {
    return 'ADVANCED';
  }
  if (masteryScore >= t.STRONG && evidenceCount >= g.STRONG.minEvidenceCount && independentSuccessCount >= g.STRONG.minIndependentSuccesses) {
    return 'STRONG';
  }
  if (masteryScore >= t.COMPETENT && evidenceCount >= g.COMPETENT.minEvidenceCount) return 'COMPETENT';
  if (masteryScore >= t.DEVELOPING) return 'DEVELOPING';
  if (masteryScore >= t.EXPLORING) return 'EXPLORING';
  if (masteryScore >= t.INTRODUCED || evidenceCount >= 1) return 'INTRODUCED';
  return 'UNKNOWN';
}

export class MasteryStateService {
  private evidenceService: EvidenceService;
  private skillGraph: SkillGraphService;

  constructor(private db: DB) {
    this.evidenceService = new EvidenceService(db);
    this.skillGraph = new SkillGraphService(db);
  }

  getState(studentId: string, skillId: string): StudentSkillState | null {
    const row = this.db.prepare('SELECT * FROM student_skill_state WHERE student_id = ? AND skill_id = ?').get(studentId, skillId) as unknown as StateRow | undefined;
    return row ? toState(row) : null;
  }

  getAllStates(studentId: string): StudentSkillState[] {
    const rows = this.db.prepare('SELECT * FROM student_skill_state WHERE student_id = ?').all(studentId) as unknown as StateRow[];
    return rows.map(toState);
  }

  /** Direct prerequisites' CURRENT persisted mastery, averaged (weighted by relationship weight). Null if the skill has no prerequisites (nothing to gate on). */
  private prerequisiteReadinessScore(studentId: string, skillId: string): number | null {
    const prereqs = this.skillGraph.getDirectPrerequisites(skillId);
    if (prereqs.length === 0) return null;
    let weightedSum = 0, weightTotal = 0;
    for (const { skill, weight } of prereqs) {
      const state = this.getState(studentId, skill.id);
      const score = state?.masteryScore ?? 0; // UNKNOWN prerequisite counts as 0 readiness, correctly gating dependents
      weightedSum += score * weight;
      weightTotal += weight;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : null;
  }

  /**
   * Recomputes and persists the full skill state for (studentId, skillId)
   * from ALL of that student's evidence for that skill. Idempotent — calling
   * it twice with the same evidence produces the same state.
   */
  recompute(studentId: string, skillId: string, now: Date = new Date()): StudentSkillState {
    const rawEvidence = this.evidenceService.getEvidenceForSkill(studentId, skillId);
    const evidence = filterAlgorithmicEvidence(rawEvidence); // Phase 34: syntax/load failures carry no algorithmic signal
    const prerequisiteReadinessScore = this.prerequisiteReadinessScore(studentId, skillId);

    const contradiction = detectContradiction(evidence);
    const mastery = computeMastery(evidence, { prerequisiteReadinessScore, now });
    const confidence = computeConfidence(evidence, contradiction.contradictory);
    const trend = computeTrend(evidence);

    const distinctDifficultyLevels = new Set(evidence.map((e) => Math.round(e.difficultyScore))).size;
    const existing = this.getState(studentId, skillId);
    const verified = existing?.masteryVerified ?? false;

    const masteryState = deriveMasteryState({
      masteryScore: mastery.masteryScore, evidenceCount: mastery.evidenceCount,
      independentSuccessCount: mastery.independentSuccessCount, confidenceScore: confidence.confidenceScore,
      distinctChallengesCount: mastery.distinctChallengesCount, distinctDifficultyLevels, verified,
    });

    let nextReviewAt: string | null = existing?.nextReviewAt ?? null;
    const reviewDays = (config.spacedReview.reviewIntervalDaysByState as Record<string, number>)[masteryState];
    if (reviewDays) {
      const d = new Date(now);
      d.setDate(d.getDate() + reviewDays);
      nextReviewAt = d.toISOString();
    }

    this.db
      .prepare(`
        INSERT INTO student_skill_state (
          student_id, skill_id, mastery_score, confidence_score, mastery_state, trend,
          evidence_count, independent_success_count, distinct_challenges_count,
          contradiction_flag, mastery_verified, last_assessed_at, next_review_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, skill_id) DO UPDATE SET
          mastery_score = excluded.mastery_score, confidence_score = excluded.confidence_score,
          mastery_state = excluded.mastery_state, trend = excluded.trend,
          evidence_count = excluded.evidence_count, independent_success_count = excluded.independent_success_count,
          distinct_challenges_count = excluded.distinct_challenges_count, contradiction_flag = excluded.contradiction_flag,
          last_assessed_at = excluded.last_assessed_at, next_review_at = excluded.next_review_at
      `)
      .run(
        studentId, skillId, mastery.masteryScore, confidence.confidenceScore, masteryState, trend,
        mastery.evidenceCount, mastery.independentSuccessCount, mastery.distinctChallengesCount,
        contradiction.contradictory ? 1 : 0, verified ? 1 : 0, now.toISOString(), nextReviewAt,
      );

    return this.getState(studentId, skillId)!;
  }

  /** Marks a skill's mastery as independently verified (Phase 25), e.g. after an unseen verification challenge is passed independently. */
  markVerified(studentId: string, skillId: string): void {
    this.db.prepare('UPDATE student_skill_state SET mastery_verified = 1 WHERE student_id = ? AND skill_id = ?').run(studentId, skillId);
  }

  getDueReviews(studentId: string, nowIso: string = new Date().toISOString()): StudentSkillState[] {
    const rows = this.db
      .prepare('SELECT * FROM student_skill_state WHERE student_id = ? AND next_review_at IS NOT NULL AND next_review_at <= ?')
      .all(studentId, nowIso) as unknown as StateRow[];
    return rows.map(toState);
  }
}
