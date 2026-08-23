import type Database from "better-sqlite3";
import { newId, nowIso } from "../util/id.js";
import type { FollowupPriority, FollowupDisplayStatus, RecruiterFollowupRow } from "../types.js";
import { recordAudit } from "./auditService.js";
import { publish } from "../events.js";
import { requireCompany, ServiceError } from "./companyService.js";

export interface FollowupInput {
  contactId?: string | null;
  ownerId?: string | null;
  title: string;
  description?: string | null;
  priority?: FollowupPriority;
  dueAt: string;
}

/** OVERDUE is never a stored value — see schema.sql. This is the single source of truth for it. */
export function displayStatus(row: RecruiterFollowupRow, nowIso_: string = nowIso()): FollowupDisplayStatus {
  if ((row.status === "OPEN" || row.status === "IN_PROGRESS") && row.due_at < nowIso_) return "OVERDUE";
  return row.status;
}

export function createFollowup(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  companyId: string,
  input: FollowupInput
): RecruiterFollowupRow {
  requireCompany(db, institutionId, companyId);
  const title = input.title.trim();
  if (!title) throw new ServiceError(400, "Follow-up title is required.");
  if (!input.dueAt) throw new ServiceError(400, "Follow-up due date is required.");

  const id = newId();
  const now = nowIso();
  const row: RecruiterFollowupRow = {
    id,
    institution_id: institutionId,
    company_id: companyId,
    contact_id: input.contactId ?? null,
    owner_id: input.ownerId ?? actorId,
    title,
    description: input.description ?? null,
    priority: input.priority ?? "MEDIUM",
    due_at: input.dueAt,
    status: "OPEN",
    completed_at: null,
    completed_by: null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `insert into recruiter_followup (
      id, institution_id, company_id, contact_id, owner_id, title, description, priority, due_at, status,
      completed_at, completed_by, created_at, updated_at
    ) values (
      @id, @institution_id, @company_id, @contact_id, @owner_id, @title, @description, @priority, @due_at, @status,
      @completed_at, @completed_by, @created_at, @updated_at
    )`
  ).run(row);

  recordAudit(db, { institutionId, actorId, entityType: "recruiter_followup", entityId: id, action: "CREATED", after: row });
  publish("FOLLOWUP_CREATED", { followupId: id, companyId, institutionId });

  return row;
}

export function getFollowup(db: Database.Database, institutionId: string, followupId: string): RecruiterFollowupRow | null {
  const row = db
    .prepare(`select * from recruiter_followup where id = ? and institution_id = ?`)
    .get(followupId, institutionId) as RecruiterFollowupRow | undefined;
  return row ?? null;
}

function requireFollowup(db: Database.Database, institutionId: string, followupId: string): RecruiterFollowupRow {
  const row = getFollowup(db, institutionId, followupId);
  if (!row) throw new ServiceError(404, "Follow-up not found.");
  return row;
}

export function updateFollowup(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  followupId: string,
  patch: Partial<FollowupInput>
): RecruiterFollowupRow {
  const existing = requireFollowup(db, institutionId, followupId);
  const title = patch.title !== undefined ? patch.title.trim() : existing.title;
  if (!title) throw new ServiceError(400, "Follow-up title is required.");

  const updated: RecruiterFollowupRow = {
    ...existing,
    title,
    description: patch.description !== undefined ? patch.description : existing.description,
    priority: patch.priority !== undefined ? patch.priority : existing.priority,
    due_at: patch.dueAt !== undefined ? patch.dueAt : existing.due_at,
    contact_id: patch.contactId !== undefined ? patch.contactId : existing.contact_id,
    owner_id: patch.ownerId !== undefined ? patch.ownerId : existing.owner_id,
    updated_at: nowIso(),
  };

  db.prepare(
    `update recruiter_followup set title=@title, description=@description, priority=@priority, due_at=@due_at,
      contact_id=@contact_id, owner_id=@owner_id, updated_at=@updated_at
     where id=@id and institution_id=@institution_id`
  ).run(updated);

  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "recruiter_followup",
    entityId: followupId,
    action: "UPDATED",
    before: existing,
    after: updated,
  });

  return updated;
}

export function completeFollowup(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  followupId: string
): RecruiterFollowupRow {
  const existing = requireFollowup(db, institutionId, followupId);
  const now = nowIso();
  const updated: RecruiterFollowupRow = {
    ...existing,
    status: "COMPLETED",
    completed_at: now,
    completed_by: actorId,
    updated_at: now,
  };
  db.prepare(
    `update recruiter_followup set status='COMPLETED', completed_at=?, completed_by=?, updated_at=? where id=? and institution_id=?`
  ).run(now, actorId, now, followupId, institutionId);

  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "recruiter_followup",
    entityId: followupId,
    action: "COMPLETED",
    before: { status: existing.status },
    after: { status: "COMPLETED" },
  });
  publish("FOLLOWUP_COMPLETED", { followupId, companyId: existing.company_id, institutionId });

  return updated;
}

export function cancelFollowup(db: Database.Database, institutionId: string, actorId: string, followupId: string) {
  const existing = requireFollowup(db, institutionId, followupId);
  const now = nowIso();
  db.prepare(`update recruiter_followup set status='CANCELLED', updated_at=? where id=? and institution_id=?`).run(
    now,
    followupId,
    institutionId
  );
  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "recruiter_followup",
    entityId: followupId,
    action: "CANCELLED",
    before: { status: existing.status },
    after: { status: "CANCELLED" },
  });
}

export function listFollowupsForCompany(db: Database.Database, institutionId: string, companyId: string): RecruiterFollowupRow[] {
  return db
    .prepare(`select * from recruiter_followup where institution_id = ? and company_id = ? order by due_at asc`)
    .all(institutionId, companyId) as RecruiterFollowupRow[];
}

export type FollowupBucket = "OVERDUE" | "TODAY" | "TOMORROW" | "THIS_WEEK" | "LATER" | "COMPLETED";

export function bucketFollowup(row: RecruiterFollowupRow, now: Date = new Date()): FollowupBucket {
  if (row.status === "COMPLETED") return "COMPLETED";
  if (row.status === "CANCELLED") return "COMPLETED"; // grouped with completed for command-centre purposes; UI can filter separately if needed
  const due = new Date(row.due_at);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
  const startOfDayAfterTomorrow = new Date(startOfToday.getTime() + 2 * 86_400_000);
  const startOfNextWeek = new Date(startOfToday.getTime() + 7 * 86_400_000);

  if (due < startOfToday) return "OVERDUE";
  if (due < startOfTomorrow) return "TODAY";
  if (due < startOfDayAfterTomorrow) return "TOMORROW";
  if (due < startOfNextWeek) return "THIS_WEEK";
  return "LATER";
}

export interface FollowupCentreQuery {
  ownerId?: string;
  companyId?: string;
}

/** Powers the Follow-up Command Centre (Phase 8): every open/overdue follow-up for the institution, bucketed. */
export function listFollowupCentre(db: Database.Database, institutionId: string, query: FollowupCentreQuery = {}) {
  const clauses = ["f.institution_id = ?"];
  const params: unknown[] = [institutionId];
  if (query.ownerId) {
    clauses.push("f.owner_id = ?");
    params.push(query.ownerId);
  }
  if (query.companyId) {
    clauses.push("f.company_id = ?");
    params.push(query.companyId);
  }

  const rows = db
    .prepare(
      `select f.*, c.name as company_name, rc.name as contact_name
       from recruiter_followup f
       join company c on c.id = f.company_id
       left join recruiter_contact rc on rc.id = f.contact_id
       where ${clauses.join(" and ")}
       order by f.due_at asc`
    )
    .all(...params) as (RecruiterFollowupRow & { company_name: string; contact_name: string | null })[];

  const buckets: Record<FollowupBucket, typeof rows> = {
    OVERDUE: [],
    TODAY: [],
    TOMORROW: [],
    THIS_WEEK: [],
    LATER: [],
    COMPLETED: [],
  };
  for (const row of rows) {
    buckets[bucketFollowup(row)].push(row);
  }
  // Completed items pile up forever otherwise; keep the command centre view to the last 20.
  buckets.COMPLETED = buckets.COMPLETED.filter((r) => r.status === "COMPLETED").slice(0, 20);

  return buckets;
}

export function countOverdue(db: Database.Database, institutionId: string, companyId?: string): number {
  const now = nowIso();
  if (companyId) {
    return (
      db
        .prepare(
          `select count(*) as n from recruiter_followup where institution_id = ? and company_id = ? and status in ('OPEN','IN_PROGRESS') and due_at < ?`
        )
        .get(institutionId, companyId, now) as { n: number }
    ).n;
  }
  return (
    db
      .prepare(
        `select count(*) as n from recruiter_followup where institution_id = ? and status in ('OPEN','IN_PROGRESS') and due_at < ?`
      )
      .get(institutionId, now) as { n: number }
  ).n;
}
