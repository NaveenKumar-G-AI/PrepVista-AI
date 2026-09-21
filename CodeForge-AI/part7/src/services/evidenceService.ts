import { PoolClient } from 'pg';
import { SkillResultComputation } from './evaluationService';

function summarize(r: SkillResultComputation): string {
  if (r.evidence_level === 'insufficient_evidence') {
    return `No challenge in this assessment produced usable evidence for ${r.skill_name}; recorded as insufficient evidence, not weak.`;
  }
  const detail = r.detail as { tests_passed: number; tests_total: number; hints_used: number };
  const seenNote = r.evidence_level === 'direct_evidence' ? 'an unseen' : 'a previously-seen';
  const hintsNote = detail.hints_used > 0 ? ` after using ${detail.hints_used} hint(s)` : ' without hints';
  return `Solved ${seenNote} ${r.skill_name} challenge (${detail.tests_passed}/${detail.tests_total} tests)${hintsNote} — recorded as ${r.performance_level}.`;
}

export async function recordEvidence(client: PoolClient, assessmentId: string, results: SkillResultComputation[]) {
  for (const r of results) {
    await client.query(`INSERT INTO assessment_evidence (assessment_id, skill_id, evidence_level, summary) VALUES ($1,$2,$3,$4)`, [
      assessmentId,
      r.skill_id,
      r.evidence_level,
      summarize(r),
    ]);
  }
}
