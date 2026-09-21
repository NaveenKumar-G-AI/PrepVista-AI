import { PoolClient } from 'pg';
import { EvidenceLevel, PerformanceLevel } from '../types';
import { measureComplexity, ComplexityProbe } from '../execution/executionEngine';
import { assessCodeQuality } from './codeQualityService';
import { logger } from '../observability/logger';

export interface SkillResultComputation {
  skill_id: string;
  skill_name: string;
  performance_level: PerformanceLevel;
  evidence_level: EvidenceLevel;
  independence_score: number | null;
  time_management_score: number | null;
  complexity_score: number | null;
  code_quality_score: number | null;
  transfer_evidence_level: EvidenceLevel | null;
  detail: Record<string, unknown>;
}

/**
 * Fully deterministic (section 25) for performance_level/evidence_level —
 * those never touch AI. complexity_score comes from an actual timed
 * experiment (measureComplexity) and code_quality_score from an actual
 * static-analysis tool (radon) — both real measurements, not guesses, but
 * both are ADDITIONAL scored dimensions alongside correctness, not gates on
 * it (section 40: style/efficiency inform the picture, they don't
 * override a correct, passing solution's core performance_level).
 */
export async function evaluateAssessment(client: PoolClient, assessmentId: string): Promise<SkillResultComputation[]> {
  const {
    rows: [assessment],
  } = await client.query(`SELECT started_at, duration_minutes FROM assessments WHERE id=$1`, [assessmentId]);

  const { rows: challengeRows } = await client.query(
    `SELECT ac.skill_id, ac.is_unseen, ac.is_transfer_probe, sk.name AS skill_name,
            c.complexity_probe,
            s.id AS submission_id, s.tests_passed, s.tests_total, s.status, s.hints_used_before_submit,
            s.submitted_at, s.code, s.language
     FROM assessment_challenges ac
     JOIN skills sk ON sk.id = ac.skill_id
     JOIN challenges c ON c.id = ac.challenge_id
     LEFT JOIN assessment_submissions s ON s.assessment_challenge_id = ac.id
     WHERE ac.assessment_id = $1
     ORDER BY ac.sequence_order`,
    [assessmentId]
  );

  const results: SkillResultComputation[] = [];

  for (const row of challengeRows) {
    const hasSubmission = row.submission_id !== null;
    const ratio = hasSubmission && row.tests_total > 0 ? row.tests_passed / row.tests_total : 0;
    const hints = row.hints_used_before_submit ?? 0;
    const independence_score = hasSubmission ? (hints === 0 ? 1.0 : hints === 1 ? 0.6 : 0.3) : null;

    let time_management_score: number | null = null;
    if (hasSubmission && assessment.started_at && row.submitted_at) {
      const elapsedMin = (new Date(row.submitted_at).getTime() - new Date(assessment.started_at).getTime()) / 60000;
      const fraction = elapsedMin / assessment.duration_minutes;
      time_management_score = fraction <= 0.7 ? 1.0 : fraction <= 1.0 ? 0.7 : 0.4;
    }

    let performance_level: PerformanceLevel;
    let evidence_level: EvidenceLevel;
    if (!hasSubmission) {
      // UNKNOWN != WEAK (sections 30, 89): a challenge that was never
      // attempted (e.g. time ran out first) produces insufficient evidence,
      // not a negative mark.
      performance_level = 'insufficient_evidence';
      evidence_level = 'insufficient_evidence';
    } else {
      evidence_level = row.is_unseen ? 'direct_evidence' : 'inferred_evidence';
      if (ratio >= 1.0) performance_level = (independence_score ?? 0) >= 0.9 ? 'strong' : 'competent';
      else if (ratio >= 0.6) performance_level = 'developing';
      else performance_level = 'weak';
    }

    // Transfer evidence (section 37): tracked as its OWN evidence_level,
    // independent from the parent skill's evidence_level. Only meaningful
    // when this specific challenge was flagged as the transfer probe AND a
    // real submission exists to measure.
    let transfer_evidence_level: EvidenceLevel | null = null;
    if (row.is_transfer_probe) {
      transfer_evidence_level = !hasSubmission ? 'insufficient_evidence' : ratio >= 0.6 ? 'direct_evidence' : 'inferred_evidence';
    }

    // Complexity (section 39): a REAL timed experiment, only run when the
    // challenge defines a probe and a correct-enough submission exists (no
    // point timing broken code).
    let complexity_score: number | null = null;
    let complexityNote: string | null = null;
    if (hasSubmission && row.complexity_probe && ratio >= 0.6) {
      try {
        const probe = row.complexity_probe as ComplexityProbe;
        const measurement = await measureComplexity(row.language, row.code, probe);
        complexity_score = measurement.score;
        complexityNote = measurement.note;
      } catch (err) {
        logger.warn('complexity_probe_failed', { assessmentId, skill: row.skill_name, error: String(err) });
      }
    }

    // Code quality (section 40): a REAL static-analysis run (radon), only
    // meaningful when there is actual submitted code to analyze.
    let code_quality_score: number | null = null;
    let qualityNote: string | null = null;
    if (hasSubmission && row.code) {
      try {
        const quality = await assessCodeQuality(row.language, row.code);
        code_quality_score = quality.score;
        qualityNote = quality.note;
      } catch (err) {
        logger.warn('code_quality_check_failed', { assessmentId, skill: row.skill_name, error: String(err) });
      }
    }

    const computed: SkillResultComputation = {
      skill_id: row.skill_id,
      skill_name: row.skill_name,
      performance_level,
      evidence_level,
      independence_score,
      time_management_score,
      complexity_score,
      code_quality_score,
      transfer_evidence_level,
      detail: {
        tests_passed: row.tests_total ? row.tests_passed : 0,
        tests_total: row.tests_total ?? 0,
        submission_status: row.status ?? 'not_attempted',
        hints_used: hints,
        is_unseen: row.is_unseen,
        is_transfer_probe: row.is_transfer_probe,
        complexity_note: complexityNote,
        code_quality_note: qualityNote,
      },
    };
    results.push(computed);

    await client.query(
      `INSERT INTO assessment_skill_results
         (assessment_id, skill_id, performance_level, evidence_level, independence_score, time_management_score,
          complexity_score, code_quality_score, transfer_evidence_level, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (assessment_id, skill_id) DO UPDATE SET
         performance_level=EXCLUDED.performance_level, evidence_level=EXCLUDED.evidence_level,
         independence_score=EXCLUDED.independence_score, time_management_score=EXCLUDED.time_management_score,
         complexity_score=EXCLUDED.complexity_score, code_quality_score=EXCLUDED.code_quality_score,
         transfer_evidence_level=EXCLUDED.transfer_evidence_level, detail=EXCLUDED.detail`,
      [
        assessmentId,
        computed.skill_id,
        computed.performance_level,
        computed.evidence_level,
        computed.independence_score,
        computed.time_management_score,
        computed.complexity_score,
        computed.code_quality_score,
        computed.transfer_evidence_level,
        JSON.stringify(computed.detail),
      ]
    );
  }

  logger.info('assessment_evaluated', { assessmentId, skillCount: results.length });
  return results;
}
