import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { EvidenceRecord } from "../types.js";

function toEvidence(row: any): EvidenceRecord {
  return {
    id: row.id,
    institutionId: row.institution_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    evidenceType: row.evidence_type,
    documentId: row.document_id,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    verified: !!row.verified,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

export class EvidenceRepository {
  constructor(private db: Database.Database) {}

  attach(input: {
    institutionId: string;
    entityType: string;
    entityId: string;
    evidenceType: string;
    documentId?: string | null;
    sourceType: EvidenceRecord["sourceType"];
    sourceReference: string;
    verified?: boolean;
    verifiedBy?: string | null;
  }): EvidenceRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO evidence
         (id, institution_id, entity_type, entity_id, evidence_type, document_id,
          source_type, source_reference, verified, verified_by, verified_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.institutionId,
        input.entityType,
        input.entityId,
        input.evidenceType,
        input.documentId ?? null,
        input.sourceType,
        input.sourceReference,
        input.verified ? 1 : 0,
        input.verifiedBy ?? null,
        input.verified ? now : null,
        now
      );
    return this.forEntity(input.entityType, input.entityId)[0];
  }

  forEntity(entityType: string, entityId: string): EvidenceRecord[] {
    return this.db
      .prepare(
        "SELECT * FROM evidence WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC"
      )
      .all(entityType, entityId)
      .map(toEvidence);
  }

  verify(id: string, verifiedBy: string): EvidenceRecord | null {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE evidence SET verified = 1, verified_by = ?, verified_at = ? WHERE id = ?"
      )
      .run(verifiedBy, now, id);
    const row = this.db.prepare("SELECT * FROM evidence WHERE id = ?").get(id);
    return row ? toEvidence(row) : null;
  }
}
