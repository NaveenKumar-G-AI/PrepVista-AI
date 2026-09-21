import { PoolClient } from 'pg';
import { MasteryLevel, EvidenceQuality, PerformanceLevel, EvidenceLevel } from '../types';

export interface MasteryState {
  skill_id: string;
  mastery_level: MasteryLevel;
  evidence_quality: EvidenceQuality;
  updated_at: string;
}

export interface MasteryEvidenceInput {
  skill_id: string;
  performance_level: PerformanceLevel;
  evidence_level: EvidenceLevel;
}

/**
 * Contract the assessment engine depends on. In the real CodeForge codebase,
 * replace ReferenceMasteryEngine with an adapter over the actual Adaptive
 * Coding Mastery Engine — nothing else in this codebase should need to
 * change, because every caller only ever talks to this interface
 * (section 31: "do not create a competing mastery algorithm").
 */
export interface MasteryEngineClient {
  getMastery(client: PoolClient, studentId: string, skillIds: string[]): Promise<MasteryState[]>;
  applyEvidence(client: PoolClient, studentId: string, evidence: MasteryEvidenceInput[]): Promise<MasteryState[]>;
}

/**
 * DEMO_ONLY reference implementation — a deliberately simple stand-in for
 * "the real mastery engine", which almost certainly uses a decayed or
 * Bayesian update rather than "the latest direct evidence wins outright".
 * Good enough to prove the integration contract end-to-end and to make
 * readiness genuinely re-derivable from fresh evidence (section 83); not
 * good enough to ship as the actual mastery algorithm.
 */
export class ReferenceMasteryEngine implements MasteryEngineClient {
  async getMastery(client: PoolClient, studentId: string, skillIds: string[]): Promise<MasteryState[]> {
    const { rows } = await client.query(
      `SELECT skill_id, mastery_level, evidence_quality, updated_at
       FROM student_skill_mastery WHERE student_id = $1 AND skill_id = ANY($2::uuid[])`,
      [studentId, skillIds]
    );
    return rows;
  }

  async applyEvidence(client: PoolClient, studentId: string, evidence: MasteryEvidenceInput[]): Promise<MasteryState[]> {
    const updated: MasteryState[] = [];
    for (const e of evidence) {
      // insufficient_evidence must never overwrite standing mastery — an
      // assessment that didn't touch a skill says nothing new about it.
      if (e.evidence_level === 'insufficient_evidence') continue;
      const masteryLevel: MasteryLevel =
        e.performance_level === 'insufficient_evidence' ? 'unknown' : e.performance_level;
      const evidenceQuality: EvidenceQuality = e.evidence_level === 'direct_evidence' ? 'direct' : 'inferred';
      const { rows } = await client.query(
        `INSERT INTO student_skill_mastery (student_id, skill_id, mastery_level, evidence_quality, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (student_id, skill_id)
         DO UPDATE SET mastery_level = EXCLUDED.mastery_level,
                        evidence_quality = EXCLUDED.evidence_quality,
                        updated_at = now()
         RETURNING skill_id, mastery_level, evidence_quality, updated_at`,
        [studentId, e.skill_id, masteryLevel, evidenceQuality]
      );
      updated.push(rows[0]);
    }
    return updated;
  }
}

export const masteryEngine: MasteryEngineClient = new ReferenceMasteryEngine();
