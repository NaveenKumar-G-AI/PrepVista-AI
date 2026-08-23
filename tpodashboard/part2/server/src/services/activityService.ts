import type Database from "better-sqlite3";
import { newId, nowIso } from "../util/id.js";
import type { ActivityType, RecruiterActivityRow } from "../types.js";
import { recordAudit } from "./auditService.js";
import { publish } from "../events.js";
import { requireCompany } from "./companyService.js";
import { ServiceError } from "./companyService.js";

export interface ActivityInput {
  contactId?: string | null;
  type: ActivityType;
  subject?: string | null;
  summary?: string | null;
  occurredAt?: string | null;
  nextAction?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function logActivity(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  companyId: string,
  input: ActivityInput
): RecruiterActivityRow {
  requireCompany(db, institutionId, companyId);
  if (!input.type) throw new ServiceError(400, "Activity type is required.");

  const id = newId();
  const now = nowIso();
  const row: RecruiterActivityRow = {
    id,
    institution_id: institutionId,
    company_id: companyId,
    contact_id: input.contactId ?? null,
    actor_id: actorId,
    type: input.type,
    subject: input.subject ?? null,
    summary: input.summary ?? null,
    occurred_at: input.occurredAt ?? now,
    next_action: input.nextAction ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    created_at: now,
  };

  db.prepare(
    `insert into recruiter_activity (
      id, institution_id, company_id, contact_id, actor_id, type, subject, summary, occurred_at, next_action, metadata, created_at
    ) values (
      @id, @institution_id, @company_id, @contact_id, @actor_id, @type, @subject, @summary, @occurred_at, @next_action, @metadata, @created_at
    )`
  ).run(row);

  recordAudit(db, { institutionId, actorId, entityType: "recruiter_activity", entityId: id, action: "CREATED", after: row });
  publish("RECRUITER_ACTIVITY_CREATED", { activityId: id, companyId, institutionId, type: input.type });

  return row;
}

export function listActivity(db: Database.Database, institutionId: string, companyId: string): RecruiterActivityRow[] {
  return db
    .prepare(`select * from recruiter_activity where institution_id = ? and company_id = ? order by occurred_at desc`)
    .all(institutionId, companyId) as RecruiterActivityRow[];
}
