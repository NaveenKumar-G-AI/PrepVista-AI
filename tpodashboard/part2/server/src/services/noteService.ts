import type Database from "better-sqlite3";
import { newId, nowIso } from "../util/id.js";
import type { CompanyNoteRow } from "../types.js";
import { recordAudit } from "./auditService.js";
import { requireCompany, ServiceError } from "./companyService.js";

export function listNotes(db: Database.Database, institutionId: string, companyId: string): CompanyNoteRow[] {
  return db
    .prepare(`select * from company_note where institution_id = ? and company_id = ? order by created_at desc`)
    .all(institutionId, companyId) as CompanyNoteRow[];
}

export function createNote(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  companyId: string,
  body: string
): CompanyNoteRow {
  requireCompany(db, institutionId, companyId);
  const trimmed = body.trim();
  if (!trimmed) throw new ServiceError(400, "Note body is required.");

  const id = newId();
  const now = nowIso();
  const row: CompanyNoteRow = {
    id,
    institution_id: institutionId,
    company_id: companyId,
    author_id: actorId,
    body: trimmed,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `insert into company_note (id, institution_id, company_id, author_id, body, created_at, updated_at)
     values (@id, @institution_id, @company_id, @author_id, @body, @created_at, @updated_at)`
  ).run(row);

  recordAudit(db, { institutionId, actorId, entityType: "company_note", entityId: id, action: "CREATED", after: { companyId } });

  return row;
}
