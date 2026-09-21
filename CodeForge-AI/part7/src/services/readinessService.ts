import { PoolClient } from 'pg';
import { CompetencyWeight, PerformanceLevel, ReadinessGates, ReadinessState, ReadinessConfidence, MasteryLevel } from '../types';
import { PERFORMANCE_LEVEL_SCORE, PERFORMANCE_LEVEL_RANK } from '../config/readinessConfig';
import { masteryEngine } from '../integrations/masteryEngine';
import { logEvent } from './eventService';

function masteryToPerformanceLevel(level: MasteryLevel): PerformanceLevel {
  return level === 'unknown' ? 'insufficient_evidence' : level;
}

export interface ReadinessComputation {
  readiness_state: ReadinessState;
  readiness_confidence: ReadinessConfidence;
  weighted_score: number;
  insufficient_count: number;
  reasons: { skill_id: string; skill_name?: string; performance_level: PerformanceLevel; weight: number; gate_met: boolean }[];
}

/**
 * Pure function — no DB, no AI, fully unit-testable. This is the piece that
 * enforces sections 82-84 directly: readiness is gate-based, not a plain
 * average (no fake READY from a high raw score alone), and unknown skills
 * are excluded from the score's numerator (not scored as failing) while
 * still being tracked and capable of blocking a READY/STRONG verdict via
 * max_insufficient_evidence_skills_for_ready.
 */
export function computeReadinessFromMastery(
  weights: CompetencyWeight[],
  masteryBySkill: Map<string, { level: MasteryLevel; quality: 'none' | 'inferred' | 'direct' }>,
  gates: ReadinessGates
): ReadinessComputation {
  const totalWeight = weights.reduce((a, w) => a + w.weight, 0) || 1;
  let numerator = 0;
  let insufficientCount = 0;
  let directCount = 0;
  const reasons: ReadinessComputation['reasons'] = [];
  const minRank = PERFORMANCE_LEVEL_RANK[gates.min_performance_level];

  for (const w of weights) {
    const m = masteryBySkill.get(w.skill_id);
    const level = masteryToPerformanceLevel(m?.level ?? 'unknown');
    const score = PERFORMANCE_LEVEL_SCORE[level] ?? 0;
    numerator += w.weight * score;
    if (level === 'insufficient_evidence') insufficientCount += 1;
    if (m?.quality === 'direct') directCount += 1;
    reasons.push({
      skill_id: w.skill_id,
      skill_name: w.skill_name,
      performance_level: level,
      weight: w.weight,
      gate_met: PERFORMANCE_LEVEL_RANK[level] >= minRank,
    });
  }

  const weightedScore = numerator / totalWeight;
  const allSkillsMeetGate = reasons.every((r) => r.gate_met);
  const allStrong = reasons.every((r) => r.performance_level === 'strong');
  const noEvidenceAtAll = insufficientCount === weights.length;

  let state: ReadinessState;
  if (noEvidenceAtAll) {
    state = 'not_started';
  } else if (allStrong && insufficientCount === 0) {
    state = 'strong';
  } else if (
    allSkillsMeetGate &&
    insufficientCount <= gates.max_insufficient_evidence_skills_for_ready &&
    weightedScore >= gates.min_weighted_score_for_ready
  ) {
    state = 'ready';
  } else if (weightedScore >= gates.min_weighted_score_for_approaching) {
    state = 'approaching_ready';
  } else if (weightedScore >= gates.min_weighted_score_for_developing) {
    state = 'developing';
  } else {
    state = 'foundation_building';
  }

  let confidence: ReadinessConfidence;
  const directRatio = directCount / weights.length;
  if (insufficientCount === 0 && directRatio >= 0.8) confidence = 'high';
  else if (insufficientCount >= Math.ceil(weights.length / 2)) confidence = 'low';
  else confidence = 'medium';

  return { readiness_state: state, readiness_confidence: confidence, weighted_score: weightedScore, insufficient_count: insufficientCount, reasons };
}

function summarizeReasonChange(c: ReadinessComputation): string {
  const unmet = c.reasons.filter((r) => !r.gate_met && r.performance_level !== 'insufficient_evidence').map((r) => r.skill_name || r.skill_id);
  const insufficient = c.reasons.filter((r) => r.performance_level === 'insufficient_evidence').map((r) => r.skill_name || r.skill_id);
  const parts: string[] = [];
  if (unmet.length) parts.push(`Below gate for: ${unmet.join(', ')}`);
  if (insufficient.length) parts.push(`Insufficient evidence for: ${insufficient.join(', ')}`);
  if (parts.length === 0) parts.push('All gated competencies meet the required threshold.');
  return parts.join('. ');
}

/**
 * Reads CURRENT mastery (post this assessment's mastery-engine update),
 * computes readiness, appends a new historical row (section 45/46 — never
 * overwrites), and writes an audit trail entry only when the state actually
 * changed (section 75), including on regression (section 83's exact
 * "READY -> APPROACHING_READY" example).
 */
export async function computeAndPersistReadiness(
  client: PoolClient,
  studentId: string,
  roleId: string,
  weights: CompetencyWeight[],
  gates: ReadinessGates,
  triggerAssessmentId: string | null
) {
  const skillIds = weights.map((w) => w.skill_id);
  const masteryRows = await masteryEngine.getMastery(client, studentId, skillIds);
  const masteryBySkill = new Map(masteryRows.map((m) => [m.skill_id, { level: m.mastery_level, quality: m.evidence_quality }]));

  const computation = computeReadinessFromMastery(weights, masteryBySkill, gates);

  const { rows: prevRows } = await client.query(
    `SELECT readiness_state FROM assessment_readiness_results WHERE student_id=$1 AND role_id=$2 ORDER BY computed_at DESC LIMIT 1`,
    [studentId, roleId]
  );
  const previousState: ReadinessState | null = prevRows[0]?.readiness_state ?? null;

  const {
    rows: [result],
  } = await client.query(
    `INSERT INTO assessment_readiness_results (assessment_id, student_id, role_id, readiness_state, readiness_confidence, reasons)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [triggerAssessmentId, studentId, roleId, computation.readiness_state, computation.readiness_confidence, JSON.stringify(computation)]
  );

  if (previousState !== computation.readiness_state) {
    const reasonText = summarizeReasonChange(computation);
    await client.query(
      `INSERT INTO readiness_audit_trail (student_id, role_id, previous_state, new_state, trigger_assessment_id, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [studentId, roleId, previousState, computation.readiness_state, triggerAssessmentId, reasonText]
    );
    if (triggerAssessmentId) {
      await logEvent(client, triggerAssessmentId, 'READINESS_UPDATED', { previous_state: previousState, new_state: computation.readiness_state });
    }
  }

  return { result, computation, previousState };
}
