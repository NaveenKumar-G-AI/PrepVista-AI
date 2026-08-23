import type Database from "better-sqlite3";
import { newId, nowIso } from "../util/id.js";
import { ServiceError } from "./companyService.js";

export interface LookupRow {
  id: string;
  institution_id: string;
  name: string;
  color?: string | null;
  created_at: string;
}

export function listIndustries(db: Database.Database, institutionId: string): LookupRow[] {
  return db
    .prepare(`select * from company_industry where institution_id = ? order by name asc`)
    .all(institutionId) as LookupRow[];
}

export function createIndustry(db: Database.Database, institutionId: string, name: string): LookupRow {
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError(400, "Industry name is required.");
  const row: LookupRow = { id: newId(), institution_id: institutionId, name: trimmed, created_at: nowIso() };
  db.prepare(`insert into company_industry (id, institution_id, name, created_at) values (@id, @institution_id, @name, @created_at)`).run(row);
  return row;
}

export function listTags(db: Database.Database, institutionId: string): LookupRow[] {
  return db.prepare(`select * from company_tag where institution_id = ? order by name asc`).all(institutionId) as LookupRow[];
}

export function createTag(db: Database.Database, institutionId: string, name: string, color?: string): LookupRow {
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError(400, "Tag name is required.");
  const row: LookupRow = { id: newId(), institution_id: institutionId, name: trimmed, color: color ?? null, created_at: nowIso() };
  db.prepare(`insert into company_tag (id, institution_id, name, color, created_at) values (@id, @institution_id, @name, @color, @created_at)`).run(
    row
  );
  return row;
}

export function tagCompany(db: Database.Database, companyId: string, tagId: string, actorId: string) {
  db.prepare(
    `insert or ignore into company_tag_link (company_id, tag_id, created_at, created_by) values (?, ?, ?, ?)`
  ).run(companyId, tagId, nowIso(), actorId);
}

export function untagCompany(db: Database.Database, companyId: string, tagId: string) {
  db.prepare(`delete from company_tag_link where company_id = ? and tag_id = ?`).run(companyId, tagId);
}

export function listCompanyTags(db: Database.Database, companyId: string): LookupRow[] {
  return db
    .prepare(
      `select t.* from company_tag t join company_tag_link l on l.tag_id = t.id where l.company_id = ? order by t.name asc`
    )
    .all(companyId) as LookupRow[];
}
