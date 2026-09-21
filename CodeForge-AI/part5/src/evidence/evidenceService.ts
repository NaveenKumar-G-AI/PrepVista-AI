import { randomUUID } from 'node:crypto';
import type { DB } from '../db/client.js';
import type { AssistanceLevel, Attempt, Challenge, Diagnosis, EvaluationResult, Evidence, MistakeCategory } from '../types.js';

interface EvidenceRow {
  id: string; student_id: string; skill_id: string; attempt_id: string; challenge_id: string;
  is_primary: number; raw_score: number; difficulty_score: number; independent: number; assistance_used: string;
  mistake_category: string | null; language_issue: number; context_type: string; created_at: string;
}

function toEvidence(r: EvidenceRow): Evidence {
  return {
    id: r.id, studentId: r.student_id, skillId: r.skill_id, attemptId: r.attempt_id, challengeId: r.challenge_id,
    isPrimary: Boolean(r.is_primary), rawScore: r.raw_score, difficultyScore: r.difficulty_score,
    independent: Boolean(r.independent), assistanceUsed: r.assistance_used as AssistanceLevel,
    mistakeCategory: r.mistake_category as MistakeCategory | null,
    languageIssue: Boolean(r.language_issue), contextType: r.context_type as Evidence['contextType'], createdAt: r.created_at,
  };
}

export class EvidenceService {
  constructor(private db: DB) {}

  /** Creates one Evidence row per skill the challenge touches (primary + secondary). Real data only — every field is derived from the actual attempt/evaluation/diagnosis passed in. */
  recordEvidence(opts: { attempt: Attempt; challenge: Challenge; evaluation: EvaluationResult; diagnosis: Diagnosis }): Evidence[] {
    const { attempt, challenge, evaluation, diagnosis } = opts;
    const rawScore = evaluation.testsTotal > 0 ? evaluation.testsPassed / evaluation.testsTotal : 0;
    const independent = attempt.assistanceUsed === 'NONE';

    const insert = this.db.prepare(`
      INSERT INTO evidence (id, student_id, skill_id, attempt_id, challenge_id, is_primary, raw_score, difficulty_score, independent, assistance_used, mistake_category, language_issue, context_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const created: Evidence[] = [];
    const skillIds = [{ id: challenge.primarySkillId, primary: true }, ...challenge.secondarySkillIds.map((id) => ({ id, primary: false }))];

    for (const { id: skillId, primary } of skillIds) {
      const evidenceId = randomUUID();
      insert.run(
        evidenceId, attempt.studentId, skillId, attempt.id, challenge.id,
        primary ? 1 : 0, rawScore, challenge.difficultyScore, independent ? 1 : 0, attempt.assistanceUsed,
        diagnosis.mistakeCategory, diagnosis.languageIssue ? 1 : 0, challenge.contextType,
      );
      const row = this.db.prepare('SELECT * FROM evidence WHERE id = ?').get(evidenceId) as unknown as EvidenceRow;
      created.push(toEvidence(row));
    }
    return created;
  }

  getEvidenceForSkill(studentId: string, skillId: string): Evidence[] {
    const rows = this.db
      .prepare('SELECT * FROM evidence WHERE student_id = ? AND skill_id = ? ORDER BY created_at ASC')
      .all(studentId, skillId) as unknown as EvidenceRow[];
    return rows.map(toEvidence);
  }

  getAllEvidenceForStudent(studentId: string): Evidence[] {
    const rows = this.db.prepare('SELECT * FROM evidence WHERE student_id = ? ORDER BY created_at ASC').all(studentId) as unknown as EvidenceRow[];
    return rows.map(toEvidence);
  }

  countRecentAttemptsOnChallenge(studentId: string, challengeId: string, sinceIso: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM attempts WHERE student_id = ? AND challenge_id = ? AND submitted_at >= ?')
      .get(studentId, challengeId, sinceIso) as { c: number };
    return row.c;
  }
}
