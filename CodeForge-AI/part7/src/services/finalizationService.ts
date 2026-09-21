import { PoolClient } from 'pg';
import { getAssessmentWithAutoExpire } from './sessionService';
import { evaluateAssessment, SkillResultComputation } from './evaluationService';
import { recordEvidence } from './evidenceService';
import { masteryEngine } from '../integrations/masteryEngine';
import { computeAndPersistReadiness } from './readinessService';
import { roadmapService as defaultRoadmapService, RoadmapService } from '../integrations/roadmapService';
import { logEvent } from './eventService';
import { appError } from '../types';

export interface FinalizationResult {
  assessment: Record<string, unknown>;
  skillResults: SkillResultComputation[];
  readiness: Awaited<ReturnType<typeof computeAndPersistReadiness>>;
  roadmap: { triggered: boolean; next_action?: string; reason?: string; error?: string };
}

/**
 * Runs the deterministic tail of the pipeline. Evaluation and evidence
 * ALWAYS complete from persisted execution results — no AI, nothing
 * optional (section 25). Mastery + readiness are computed synchronously,
 * also deterministically. Roadmap recalculation is best-effort: if it
 * throws, the already-computed assessment/evidence/readiness results are
 * still committed — only the roadmap trigger step degrades, and that
 * degradation is recorded as an event rather than silently swallowed
 * (section 88). `roadmapImpl` is injectable purely so the failure-recovery
 * test can prove this without needing a real outage.
 */
export async function finalizeAssessment(
  client: PoolClient,
  assessmentId: string,
  roadmapImpl: RoadmapService = defaultRoadmapService
): Promise<FinalizationResult> {
  let assessment = await getAssessmentWithAutoExpire(client, assessmentId);
  if (assessment.status === 'expired') {
    // finalize from whatever was submitted before expiry — do not block
  } else if (assessment.status !== 'submitted') {
    throw appError('INVALID_STATE_TRANSITION', `Cannot finalize assessment in status ${assessment.status}`, 409);
  } else {
    const { rows } = await client.query(`UPDATE assessments SET status='evaluating' WHERE id=$1 RETURNING *`, [assessmentId]);
    assessment = rows[0];
  }

  const skillResults = await evaluateAssessment(client, assessmentId);
  await recordEvidence(client, assessmentId, skillResults);

  await masteryEngine.applyEvidence(
    client,
    assessment.student_id,
    skillResults.map((r) => ({ skill_id: r.skill_id, performance_level: r.performance_level, evidence_level: r.evidence_level }))
  );

  const config = assessment.config_snapshot as {
    competency_weights: { skill_id: string; skill_name?: string; weight: number }[];
    readiness_gates: Parameters<typeof computeAndPersistReadiness>[4];
  };

  const readiness = await computeAndPersistReadiness(
    client,
    assessment.student_id,
    assessment.role_id,
    config.competency_weights,
    config.readiness_gates,
    assessmentId
  );

  let roadmap: FinalizationResult['roadmap'];
  try {
    const weakest = readiness.computation.reasons
      .filter((r) => !r.gate_met)
      .sort((a, b) => b.weight - a.weight)
      .map((r) => ({ skill_id: r.skill_id, skill_name: r.skill_name || r.skill_id, performance_level: r.performance_level }));
    const rm = await roadmapImpl.recalculate(client, assessment.student_id, assessment.role_id, { assessmentId, weakestSkills: weakest });
    roadmap = rm;
    await logEvent(client, assessmentId, 'ROADMAP_RECALCULATION_TRIGGERED', rm as unknown as Record<string, unknown>);
  } catch (err) {
    roadmap = { triggered: false, error: err instanceof Error ? err.message : String(err) };
    await logEvent(client, assessmentId, 'ROADMAP_RECALCULATION_TRIGGERED', { triggered: false, error: roadmap.error });
    // deliberately NOT rethrown — section 88: a roadmap outage must never corrupt the already-valid assessment result
  }

  const {
    rows: [completed],
  } = await client.query(`UPDATE assessments SET status='completed', completed_at=now() WHERE id=$1 RETURNING *`, [assessmentId]);
  await logEvent(client, assessmentId, 'ASSESSMENT_COMPLETED', {});

  return { assessment: completed, skillResults, readiness, roadmap };
}
