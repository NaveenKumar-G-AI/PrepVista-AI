import type Database from "better-sqlite3";
import { requireCompany } from "./companyService.js";
import { requireContact } from "./contactService.js";
import { listContacts } from "./contactService.js";
import { listActivity } from "./activityService.js";
import { listFollowupsForCompany, displayStatus, countOverdue } from "./followupService.js";
import { computeRelationshipHealth, isRepeatRecruiter } from "./relationshipHealthService.js";
import { getRecruiterOpportunities } from "./opportunityService.js";
import { nowIso } from "../util/id.js";

/**
 * These functions return only verified, structured facts pulled from real rows — never a
 * generated summary. A future AI Placement Officer should be able to say "I found three
 * overdue recruiter follow-ups" by calling get_overdue_followups, not by reading tables
 * or being asked to estimate. Spec Phase 18.
 */

export function getCompanyContext(db: Database.Database, institutionId: string, companyId: string) {
  const company = requireCompany(db, institutionId, companyId);
  const contacts = listContacts(db, institutionId, companyId);
  const activity = listActivity(db, institutionId, companyId);
  const followups = listFollowupsForCompany(db, institutionId, companyId);
  const overdueCount = countOverdue(db, institutionId, companyId);
  const lastActivity = activity[0] ?? null;
  const daysSinceLastContact = lastActivity
    ? Math.floor((Date.now() - Date.parse(lastActivity.occurred_at)) / 86_400_000)
    : null;
  const health = computeRelationshipHealth({
    relationshipStage: company.relationship_stage,
    daysSinceLastContact,
    overdueFollowupCount: overdueCount,
    openFollowupCount: followups.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length,
  });

  return {
    company,
    relationshipHealth: health,
    isRepeatRecruiter: isRepeatRecruiter(db, company),
    primaryContact: contacts.find((c) => c.is_primary) ?? null,
    contactCount: contacts.length,
    activityCount: activity.length,
    lastActivity,
    openFollowupCount: followups.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length,
    overdueFollowupCount: overdueCount,
    drivesCount: 0, // real once Part 3 exists — see companyService.getCompanyDrives
    studentsHiredCount: 0, // real once offer/joining records exist — see PART2_DOMAIN_MODEL.md
  };
}

export function getRecruiterContext(db: Database.Database, institutionId: string, contactId: string) {
  const contact = requireContact(db, institutionId, contactId);
  const activity = db
    .prepare(`select * from recruiter_activity where contact_id = ? order by occurred_at desc`)
    .all(contactId);
  const followups = db.prepare(`select * from recruiter_followup where contact_id = ? order by due_at asc`).all(contactId);
  return { contact, activityCount: activity.length, recentActivity: activity.slice(0, 5), followups };
}

export function getCompanyRelationshipContext(db: Database.Database, institutionId: string, companyId: string) {
  const ctx = getCompanyContext(db, institutionId, companyId);
  return {
    companyId,
    relationshipStage: ctx.company.relationship_stage,
    relationshipHealth: ctx.relationshipHealth,
    owner: ctx.company.relationship_owner_id,
    isRepeatRecruiter: ctx.isRepeatRecruiter,
  };
}

export function getOpenFollowups(db: Database.Database, institutionId: string, companyId: string) {
  return listFollowupsForCompany(db, institutionId, companyId)
    .filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS")
    .map((f) => ({ ...f, displayStatus: displayStatus(f) }));
}

export function getCompanyHistory(db: Database.Database, institutionId: string, companyId: string) {
  requireCompany(db, institutionId, companyId);
  const activity = listActivity(db, institutionId, companyId).map((a) => ({
    kind: "activity" as const,
    at: a.occurred_at,
    type: a.type,
    subject: a.subject,
    summary: a.summary,
  }));
  const stageChanges = (
    db.prepare(`select * from company_status_history where company_id = ? order by changed_at desc`).all(companyId) as {
      old_stage: string | null;
      new_stage: string;
      changed_at: string;
      reason: string | null;
    }[]
  ).map((s) => ({
    kind: "stage_change" as const,
    at: s.changed_at,
    from: s.old_stage,
    to: s.new_stage,
    reason: s.reason,
  }));
  return [...activity, ...stageChanges].sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function getRecruiterOpportunitiesContext(db: Database.Database, institutionId: string) {
  return getRecruiterOpportunities(db, institutionId);
}

export function getOverdueFollowupsContext(db: Database.Database, institutionId: string) {
  const now = nowIso();
  const rows = db
    .prepare(
      `select f.*, c.name as company_name from recruiter_followup f
       join company c on c.id = f.company_id
       where f.institution_id = ? and f.status in ('OPEN','IN_PROGRESS') and f.due_at < ?
       order by f.due_at asc`
    )
    .all(institutionId, now);
  return rows;
}
