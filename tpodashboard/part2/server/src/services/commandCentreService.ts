import type Database from "better-sqlite3";
import { nowIso } from "../util/id.js";
import { getRecruiterOpportunities } from "./opportunityService.js";

/** Every number here is a live query — nothing hardcoded, nothing cached in this pass. */
export function getRecruiterPulse(db: Database.Database, institutionId: string) {
  const now = nowIso();

  const companies = (
    db.prepare(`select count(*) as n from company where institution_id = ? and status = 'ACTIVE'`).get(institutionId) as {
      n: number;
    }
  ).n;

  const activeRelationships = (
    db
      .prepare(
        `select count(*) as n from company where institution_id = ? and status = 'ACTIVE' and relationship_stage != 'PROSPECT' and relationship_stage != 'INACTIVE'`
      )
      .get(institutionId) as { n: number }
  ).n;

  const openFollowups = (
    db
      .prepare(`select count(*) as n from recruiter_followup where institution_id = ? and status in ('OPEN','IN_PROGRESS')`)
      .get(institutionId) as { n: number }
  ).n;

  const overdueFollowups = (
    db
      .prepare(
        `select count(*) as n from recruiter_followup where institution_id = ? and status in ('OPEN','IN_PROGRESS') and due_at < ?`
      )
      .get(institutionId, now) as { n: number }
  ).n;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const newRelationships = (
    db
      .prepare(`select count(*) as n from company where institution_id = ? and created_at >= ?`)
      .get(institutionId, thirtyDaysAgo) as { n: number }
  ).n;

  const repeatRecruiters = (
    db
      .prepare(`select count(*) as n from company where institution_id = ? and status = 'ACTIVE' and relationship_stage = 'REPEAT_RECRUITER'`)
      .get(institutionId) as { n: number }
  ).n;

  const requirementsReceived = (
    db
      .prepare(
        `select count(*) as n from recruiter_activity where institution_id = ? and type = 'REQUIREMENT_RECEIVED' and occurred_at >= ?`
      )
      .get(institutionId, thirtyDaysAgo) as { n: number }
  ).n;

  const opportunities = getRecruiterOpportunities(db, institutionId).slice(0, 10);

  return {
    companies,
    activeRelationships,
    openFollowups,
    overdueFollowups,
    newRelationshipsLast30Days: newRelationships,
    repeatRecruiters,
    requirementsReceivedLast30Days: requirementsReceived,
    recruiterPulse: opportunities,
    isEmpty: companies === 0,
  };
}
