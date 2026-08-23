import type Database from "better-sqlite3";
import { newId, nowIso } from "../util/id.js";
import { normalizeName, extractDomain, nameSimilarity } from "../util/normalize.js";
import type { CompanyRow, RelationshipStage } from "../types.js";
import { recordAudit } from "./auditService.js";
import { publish } from "../events.js";
import { computeRelationshipHealth, isRepeatRecruiter } from "./relationshipHealthService.js";

export interface CompanyInput {
  name: string;
  legalName?: string | null;
  brandName?: string | null;
  website?: string | null;
  industryId?: string | null;
  sector?: string | null;
  companySize?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
  description?: string | null;
  relationshipOwnerId?: string | null;
}

export interface DuplicateMatch {
  company: CompanyRow;
  matchType: "EXACT_NAME" | "EXACT_DOMAIN" | "POSSIBLE_NAME";
  similarity: number;
}

export function checkDuplicates(
  db: Database.Database,
  institutionId: string,
  name: string,
  website: string | null | undefined
): DuplicateMatch[] {
  const normalized = normalizeName(name);
  const domain = extractDomain(website);
  const candidates = db
    .prepare(`select * from company where institution_id = ? and status = 'ACTIVE'`)
    .all(institutionId) as CompanyRow[];

  const matches: DuplicateMatch[] = [];
  for (const c of candidates) {
    if (c.normalized_name === normalized) {
      matches.push({ company: c, matchType: "EXACT_NAME", similarity: 1 });
      continue;
    }
    if (domain && c.website_domain && c.website_domain === domain) {
      matches.push({ company: c, matchType: "EXACT_DOMAIN", similarity: 1 });
      continue;
    }
    const sim = nameSimilarity(name, c.name);
    if (sim >= 0.6) {
      matches.push({ company: c, matchType: "POSSIBLE_NAME", similarity: sim });
    }
  }
  return matches.sort((a, b) => b.similarity - a.similarity);
}

export function createCompany(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  input: CompanyInput,
  opts: { allowDuplicate?: boolean } = {}
): { company: CompanyRow; duplicates: DuplicateMatch[] } {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new ServiceError(400, "Company name is required.");

  const duplicates = checkDuplicates(db, institutionId, trimmedName, input.website);
  const hasExact = duplicates.some((d) => d.matchType !== "POSSIBLE_NAME");
  if (hasExact && !opts.allowDuplicate) {
    throw new DuplicateCompanyError(duplicates);
  }

  const id = newId();
  const now = nowIso();
  const row: CompanyRow = {
    id,
    institution_id: institutionId,
    name: trimmedName,
    normalized_name: normalizeName(trimmedName),
    legal_name: input.legalName ?? null,
    brand_name: input.brandName ?? null,
    website: input.website ?? null,
    website_domain: extractDomain(input.website),
    industry_id: input.industryId ?? null,
    sector: input.sector ?? null,
    company_size: input.companySize ?? null,
    headquarters_city: input.headquartersCity ?? null,
    headquarters_state: input.headquartersState ?? null,
    headquarters_country: input.headquartersCountry ?? null,
    description: input.description ?? null,
    logo_document_id: null,
    status: "ACTIVE",
    relationship_stage: "PROSPECT",
    relationship_owner_id: input.relationshipOwnerId ?? actorId,
    created_at: now,
    updated_at: now,
    archived_at: null,
  };

  db.prepare(
    `insert into company (
      id, institution_id, name, normalized_name, legal_name, brand_name, website, website_domain,
      industry_id, sector, company_size, headquarters_city, headquarters_state, headquarters_country,
      description, logo_document_id, status, relationship_stage, relationship_owner_id, created_at, updated_at, archived_at
    ) values (
      @id, @institution_id, @name, @normalized_name, @legal_name, @brand_name, @website, @website_domain,
      @industry_id, @sector, @company_size, @headquarters_city, @headquarters_state, @headquarters_country,
      @description, @logo_document_id, @status, @relationship_stage, @relationship_owner_id, @created_at, @updated_at, @archived_at
    )`
  ).run(row);

  db.prepare(
    `insert into company_status_history (id, company_id, old_stage, new_stage, actor_id, reason, changed_at)
     values (?, ?, null, ?, ?, ?, ?)`
  ).run(newId(), id, "PROSPECT", actorId, "Company created", now);

  recordAudit(db, { institutionId, actorId, entityType: "company", entityId: id, action: "CREATED", after: row });
  publish("COMPANY_CREATED", { companyId: id, institutionId });

  return { company: row, duplicates: duplicates.filter((d) => d.matchType === "POSSIBLE_NAME") };
}

export function getCompany(db: Database.Database, institutionId: string, companyId: string): CompanyRow | null {
  const row = db
    .prepare(`select * from company where id = ? and institution_id = ?`)
    .get(companyId, institutionId) as CompanyRow | undefined;
  return row ?? null;
}

export function requireCompany(db: Database.Database, institutionId: string, companyId: string): CompanyRow {
  const row = getCompany(db, institutionId, companyId);
  if (!row) throw new ServiceError(404, "Company not found.");
  return row;
}

export function updateCompany(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  companyId: string,
  patch: Partial<CompanyInput>
): CompanyRow {
  const existing = requireCompany(db, institutionId, companyId);
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  if (!name) throw new ServiceError(400, "Company name is required.");

  const website = patch.website !== undefined ? patch.website : existing.website;
  const updated: CompanyRow = {
    ...existing,
    name,
    normalized_name: normalizeName(name),
    legal_name: patch.legalName !== undefined ? patch.legalName : existing.legal_name,
    brand_name: patch.brandName !== undefined ? patch.brandName : existing.brand_name,
    website,
    website_domain: extractDomain(website),
    industry_id: patch.industryId !== undefined ? patch.industryId : existing.industry_id,
    sector: patch.sector !== undefined ? patch.sector : existing.sector,
    company_size: patch.companySize !== undefined ? patch.companySize : existing.company_size,
    headquarters_city: patch.headquartersCity !== undefined ? patch.headquartersCity : existing.headquarters_city,
    headquarters_state: patch.headquartersState !== undefined ? patch.headquartersState : existing.headquarters_state,
    headquarters_country:
      patch.headquartersCountry !== undefined ? patch.headquartersCountry : existing.headquarters_country,
    description: patch.description !== undefined ? patch.description : existing.description,
    relationship_owner_id:
      patch.relationshipOwnerId !== undefined ? patch.relationshipOwnerId : existing.relationship_owner_id,
    updated_at: nowIso(),
  };

  db.prepare(
    `update company set name=@name, normalized_name=@normalized_name, legal_name=@legal_name, brand_name=@brand_name,
      website=@website, website_domain=@website_domain, industry_id=@industry_id, sector=@sector,
      company_size=@company_size, headquarters_city=@headquarters_city, headquarters_state=@headquarters_state,
      headquarters_country=@headquarters_country, description=@description, relationship_owner_id=@relationship_owner_id,
      updated_at=@updated_at
     where id=@id and institution_id=@institution_id`
  ).run(updated);

  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "company",
    entityId: companyId,
    action: "UPDATED",
    before: existing,
    after: updated,
  });
  publish("COMPANY_UPDATED", { companyId, institutionId });

  return updated;
}

export function changeRelationshipStage(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  companyId: string,
  newStage: RelationshipStage,
  reason?: string
): CompanyRow {
  const existing = requireCompany(db, institutionId, companyId);
  if (existing.relationship_stage === newStage) return existing;

  const now = nowIso();
  db.prepare(`update company set relationship_stage = ?, updated_at = ? where id = ? and institution_id = ?`).run(
    newStage,
    now,
    companyId,
    institutionId
  );
  db.prepare(
    `insert into company_status_history (id, company_id, old_stage, new_stage, actor_id, reason, changed_at)
     values (?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), companyId, existing.relationship_stage, newStage, actorId, reason ?? null, now);

  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "company",
    entityId: companyId,
    action: "RELATIONSHIP_STAGE_CHANGED",
    before: { relationship_stage: existing.relationship_stage },
    after: { relationship_stage: newStage, reason: reason ?? null },
  });
  publish("RELATIONSHIP_STAGE_CHANGED", { companyId, institutionId, from: existing.relationship_stage, to: newStage });

  return { ...existing, relationship_stage: newStage, updated_at: now };
}

export function archiveCompany(db: Database.Database, institutionId: string, actorId: string, companyId: string) {
  const existing = requireCompany(db, institutionId, companyId);
  const now = nowIso();
  db.prepare(`update company set status = 'ARCHIVED', archived_at = ?, updated_at = ? where id = ? and institution_id = ?`).run(
    now,
    now,
    companyId,
    institutionId
  );
  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "company",
    entityId: companyId,
    action: "ARCHIVED",
    before: { status: existing.status },
    after: { status: "ARCHIVED" },
  });
  publish("COMPANY_ARCHIVED", { companyId, institutionId });
}

export function restoreCompany(db: Database.Database, institutionId: string, actorId: string, companyId: string) {
  requireCompany(db, institutionId, companyId);
  const now = nowIso();
  db.prepare(`update company set status = 'ACTIVE', archived_at = null, updated_at = ? where id = ? and institution_id = ?`).run(
    now,
    companyId,
    institutionId
  );
  recordAudit(db, { institutionId, actorId, entityType: "company", entityId: companyId, action: "RESTORED" });
}

// ---------------------------------------------------------------------------
// Search / filter / sort
// ---------------------------------------------------------------------------

export interface CompanyListQuery {
  search?: string;
  industryId?: string;
  city?: string;
  relationshipStage?: RelationshipStage;
  ownerId?: string;
  repeatRecruiter?: boolean;
  followupStatus?: "OVERDUE" | "OPEN" | "NONE";
  includeArchived?: boolean;
  sort?: "name" | "relationship" | "lastContact" | "nextFollowup" | "health";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface CompanyListItem extends CompanyRow {
  industryName: string | null;
  lastContactAt: string | null;
  daysSinceLastContact: number | null;
  nextFollowupAt: string | null;
  nextFollowupTitle: string | null;
  overdueFollowupCount: number;
  openFollowupCount: number;
  drivesCount: number;
  studentsHiredCount: number;
  isRepeatRecruiter: boolean;
  relationshipHealth: ReturnType<typeof computeRelationshipHealth>;
}

/**
 * Fetches every company matching the SQL-filterable criteria (institution, status, text
 * search, stage, industry, city, owner) for the institution, then computes health /
 * repeat-recruiter / follow-up-derived fields in JS and applies the remaining filters,
 * sort, and pagination there. Fine up to several thousand companies per institution; if
 * that stops being true, promote relationship_health to a cached column recomputed on
 * write (the spec anticipates this — see PART2_DOMAIN_MODEL.md's design notes).
 */
export function listCompanies(db: Database.Database, institutionId: string, query: CompanyListQuery) {
  const clauses: string[] = ["c.institution_id = ?"];
  const params: unknown[] = [institutionId];

  if (!query.includeArchived) {
    clauses.push("c.status = 'ACTIVE'");
  }
  if (query.relationshipStage) {
    clauses.push("c.relationship_stage = ?");
    params.push(query.relationshipStage);
  }
  if (query.industryId) {
    clauses.push("c.industry_id = ?");
    params.push(query.industryId);
  }
  if (query.ownerId) {
    clauses.push("c.relationship_owner_id = ?");
    params.push(query.ownerId);
  }
  if (query.city) {
    clauses.push("c.headquarters_city like ?");
    params.push(`%${query.city}%`);
  }
  if (query.search) {
    const like = `%${query.search}%`;
    clauses.push(`(
      c.name like ? or c.legal_name like ? or c.website like ? or c.headquarters_city like ?
      or exists (select 1 from recruiter_contact rc where rc.company_id = c.id and (rc.name like ? or rc.email like ?))
    )`);
    params.push(like, like, like, like, like, like);
  }

  const rows = db
    .prepare(`select c.* from company c where ${clauses.join(" and ")} order by c.name asc`)
    .all(...params) as CompanyRow[];

  const industries = new Map(
    (db.prepare(`select id, name from company_industry where institution_id = ?`).all(institutionId) as {
      id: string;
      name: string;
    }[]).map((i) => [i.id, i.name])
  );

  const enriched: CompanyListItem[] = rows.map((row) => enrichCompany(db, row, industries));

  let filtered = enriched;
  if (query.repeatRecruiter) filtered = filtered.filter((c) => c.isRepeatRecruiter);
  if (query.followupStatus === "OVERDUE") filtered = filtered.filter((c) => c.overdueFollowupCount > 0);
  if (query.followupStatus === "OPEN") filtered = filtered.filter((c) => c.openFollowupCount > 0);
  if (query.followupStatus === "NONE") filtered = filtered.filter((c) => c.openFollowupCount === 0);

  const dir = query.sortDir === "desc" ? -1 : 1;
  const sortKey = query.sort ?? "name";
  filtered.sort((a, b) => {
    switch (sortKey) {
      case "relationship":
        return dir * a.relationship_stage.localeCompare(b.relationship_stage);
      case "lastContact":
        return dir * ((a.daysSinceLastContact ?? Infinity) - (b.daysSinceLastContact ?? Infinity));
      case "nextFollowup":
        return dir * ((a.nextFollowupAt ? Date.parse(a.nextFollowupAt) : Infinity) - (b.nextFollowupAt ? Date.parse(b.nextFollowupAt) : Infinity));
      case "health":
        return dir * a.relationshipHealth.health.localeCompare(b.relationshipHealth.health);
      default:
        return dir * a.name.localeCompare(b.name);
    }
  });

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total: filtered.length, page, pageSize };
}

function enrichCompany(
  db: Database.Database,
  row: CompanyRow,
  industries: Map<string, string>
): CompanyListItem {
  const lastActivity = db
    .prepare(`select occurred_at from recruiter_activity where company_id = ? order by occurred_at desc limit 1`)
    .get(row.id) as { occurred_at: string } | undefined;

  const nextFollowup = db
    .prepare(
      `select id, title, due_at from recruiter_followup
       where company_id = ? and status in ('OPEN','IN_PROGRESS') order by due_at asc limit 1`
    )
    .get(row.id) as { id: string; title: string; due_at: string } | undefined;

  const now = nowIso();
  const overdueFollowupCount = (
    db
      .prepare(
        `select count(*) as n from recruiter_followup
         where company_id = ? and status in ('OPEN','IN_PROGRESS') and due_at < ?`
      )
      .get(row.id, now) as { n: number }
  ).n;
  const openFollowupCount = (
    db
      .prepare(`select count(*) as n from recruiter_followup where company_id = ? and status in ('OPEN','IN_PROGRESS')`)
      .get(row.id) as { n: number }
  ).n;

  const daysSinceLastContact = lastActivity
    ? Math.floor((Date.parse(now) - Date.parse(lastActivity.occurred_at)) / 86_400_000)
    : null;

  const health = computeRelationshipHealth({
    relationshipStage: row.relationship_stage,
    daysSinceLastContact,
    overdueFollowupCount,
    openFollowupCount,
  });

  return {
    ...row,
    industryName: row.industry_id ? industries.get(row.industry_id) ?? null : null,
    lastContactAt: lastActivity?.occurred_at ?? null,
    daysSinceLastContact,
    nextFollowupAt: nextFollowup?.due_at ?? null,
    nextFollowupTitle: nextFollowup?.title ?? null,
    overdueFollowupCount,
    openFollowupCount,
    drivesCount: 0, // Phase 14: populated once Part 3 (Drives) exists — see getCompanyDrives below
    studentsHiredCount: 0, // Phase 15: derives from future offer/joining records, never stored independently here
    isRepeatRecruiter: isRepeatRecruiter(db, row),
    relationshipHealth: health,
  };
}

/**
 * Phase 14 interface: Part 3 (Drives) will implement the real version of this. Returning
 * [] rather than throwing lets the dossier's Drives tab call this today and start
 * rendering real data the moment Part 3 lands, without either module owning a shared table.
 */
export function getCompanyDrives(_db: Database.Database, _companyId: string): unknown[] {
  return [];
}

export class ServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class DuplicateCompanyError extends Error {
  duplicates: DuplicateMatch[];
  status = 409;
  constructor(duplicates: DuplicateMatch[]) {
    super("A matching company already exists.");
    this.duplicates = duplicates;
  }
}
