import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { MasteryEvidenceRecord } from "../domain/types";

export const MasteryRepository = {
  record(
    studentId: string,
    skillId: string,
    evidenceType: MasteryEvidenceRecord["evidenceType"],
    detail: Record<string, unknown>
  ): MasteryEvidenceRecord {
    const record: MasteryEvidenceRecord = {
      id: randomUUID(),
      studentId,
      skillId,
      evidenceType,
      detail,
      createdAt: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO mastery_evidence (id, student_id, skill_id, evidence_type, detail, created_at)
       VALUES (@id, @studentId, @skillId, @evidenceType, @detail, @createdAt)`
    ).run({ ...record, detail: JSON.stringify(record.detail) });
    return record;
  },

  forSkill(studentId: string, skillId: string): MasteryEvidenceRecord[] {
    const rows = db
      .prepare(`SELECT * FROM mastery_evidence WHERE student_id = ? AND skill_id = ? ORDER BY created_at ASC`)
      .all(studentId, skillId) as any[];
    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      skillId: r.skill_id,
      evidenceType: r.evidence_type,
      detail: JSON.parse(r.detail),
      createdAt: r.created_at,
    }));
  },
};
