import { db } from '../db/client';
import { newId } from '../utils/ids';
import type { DiscoveryStatus, StrategyType } from '../domain/enums';

export interface DiscoveryRow {
  id: string;
  tenant_id: string;
  student_id: string;
  candidate_strategy_type: StrategyType;
  question_family_id: string | null;
  method_signature: string;
  evidence: string;
  confidence: number;
  status: DiscoveryStatus;
  resulting_shortcut_id: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

export function findDiscovery(studentId: string, questionFamilyId: string | null, methodSignature: string): DiscoveryRow | undefined {
  return db
    .prepare(
      `SELECT * FROM shortcut_discoveries
       WHERE student_id = ? AND ifnull(question_family_id,'') = ifnull(?,'') AND method_signature = ?`
    )
    .get(studentId, questionFamilyId, methodSignature) as DiscoveryRow | undefined;
}

export function insertDiscovery(input: {
  tenantId: string;
  studentId: string;
  candidateStrategyType: StrategyType;
  questionFamilyId: string | null;
  methodSignature: string;
  evidence: unknown;
  confidence: number;
  status: DiscoveryStatus;
}): DiscoveryRow {
  const id = newId('disc');
  db.prepare(
    `INSERT INTO shortcut_discoveries (
      id, tenant_id, student_id, candidate_strategy_type, question_family_id, method_signature, evidence, confidence, status
    ) VALUES (@id, @tenant_id, @student_id, @candidate_strategy_type, @question_family_id, @method_signature, @evidence, @confidence, @status)`
  ).run({
    id,
    tenant_id: input.tenantId,
    student_id: input.studentId,
    candidate_strategy_type: input.candidateStrategyType,
    question_family_id: input.questionFamilyId,
    method_signature: input.methodSignature,
    evidence: JSON.stringify(input.evidence),
    confidence: input.confidence,
    status: input.status,
  });
  return db.prepare(`SELECT * FROM shortcut_discoveries WHERE id = ?`).get(id) as DiscoveryRow;
}

export function updateDiscoveryEvidence(id: string, evidence: unknown, confidence: number, status: DiscoveryStatus): void {
  db.prepare(
    `UPDATE shortcut_discoveries SET evidence = ?, confidence = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(evidence), confidence, status, id);
}

export function listDiscoveriesForStudent(studentId: string, status?: DiscoveryStatus): DiscoveryRow[] {
  if (status) {
    return db
      .prepare(`SELECT * FROM shortcut_discoveries WHERE student_id = ? AND status = ? ORDER BY updated_at DESC`)
      .all(studentId, status) as DiscoveryRow[];
  }
  return db.prepare(`SELECT * FROM shortcut_discoveries WHERE student_id = ? ORDER BY updated_at DESC`).all(studentId) as DiscoveryRow[];
}

export function markDiscoveryReviewed(id: string, status: DiscoveryStatus, resultingShortcutId?: string | null): void {
  db.prepare(
    `UPDATE shortcut_discoveries SET status = ?, resulting_shortcut_id = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(status, resultingShortcutId ?? null, id);
}
