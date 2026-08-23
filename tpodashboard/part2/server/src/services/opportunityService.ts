import type Database from "better-sqlite3";
import type { CompanyRow, Insight } from "../types.js";
import { computeRelationshipHealth, isRepeatRecruiter } from "./relationshipHealthService.js";
import { countOverdue } from "./followupService.js";
import { nowIso } from "../util/id.js";

/**
 * Every insight here is built strictly from rows that exist — no scoring model, no LLM
 * call, nothing inferred beyond what's in `recruiter_activity` / `recruiter_followup` /
 * `company_status_history`. A future AI layer can narrate these; it should not compute
 * them (spec Phase 19: "Do not ask an LLM to calculate this. Use deterministic code.").
 */
export function getRecruiterOpportunities(db: Database.Database, institutionId: string): Insight[] {
  const companies = db
    .prepare(`select * from company where institution_id = ? and status = 'ACTIVE'`)
    .all(institutionId) as CompanyRow[];

  const insights: Insight[] = [];
  const now = nowIso();

  for (const company of companies) {
    const lastActivity = db
      .prepare(`select occurred_at from recruiter_activity where company_id = ? order by occurred_at desc limit 1`)
      .get(company.id) as { occurred_at: string } | undefined;
    const daysSinceLastContact = lastActivity
      ? Math.floor((Date.parse(now) - Date.parse(lastActivity.occurred_at)) / 86_400_000)
      : null;

    const overdueCount = countOverdue(db, institutionId, company.id);
    const openFollowups = (
      db
        .prepare(`select count(*) as n from recruiter_followup where company_id = ? and status in ('OPEN','IN_PROGRESS')`)
        .get(company.id) as { n: number }
    ).n;

    // 1. Overdue follow-up
    if (overdueCount > 0) {
      const oldestOverdue = db
        .prepare(
          `select title, due_at from recruiter_followup where company_id = ? and status in ('OPEN','IN_PROGRESS') and due_at < ? order by due_at asc limit 1`
        )
        .get(company.id, now) as { title: string; due_at: string } | undefined;
      const daysOverdue = oldestOverdue ? Math.floor((Date.parse(now) - Date.parse(oldestOverdue.due_at)) / 86_400_000) : null;
      insights.push({
        type: "FOLLOWUP_OVERDUE",
        priority: overdueCount >= 2 ? "CRITICAL" : "HIGH",
        company_id: company.id,
        company_name: company.name,
        title: `${overdueCount} overdue follow-up${overdueCount === 1 ? "" : "s"} at ${company.name}`,
        reason: oldestOverdue
          ? `"${oldestOverdue.title}" is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.`
          : `${overdueCount} follow-up(s) are overdue.`,
        evidence: { overdueCount, oldestOverdueTitle: oldestOverdue?.title ?? null, daysOverdue },
        recommended_action: "Review and complete or reschedule the overdue follow-up.",
      });
    }

    // 2. Recent contact with no next action scheduled — a loose thread
    if (daysSinceLastContact !== null && daysSinceLastContact <= 14 && openFollowups === 0 && overdueCount === 0) {
      insights.push({
        type: "NO_NEXT_ACTION",
        priority: "MEDIUM",
        company_id: company.id,
        company_name: company.name,
        title: `No next step scheduled for ${company.name}`,
        reason: `Last contact was ${daysSinceLastContact} day${daysSinceLastContact === 1 ? "" : "s"} ago and nothing is currently scheduled.`,
        evidence: { daysSinceLastContact, openFollowups },
        recommended_action: "Log the outcome and schedule a follow-up so this doesn't go cold.",
      });
    }

    // 3. Repeat recruiter gone quiet — a proven relationship with no recent contact
    const repeat = isRepeatRecruiter(db, company);
    if (repeat && (daysSinceLastContact === null || daysSinceLastContact > 30) && openFollowups === 0) {
      const hiringHistory = db
        .prepare(`select count(*) as n from company_status_history where company_id = ? and new_stage = 'HIRING'`)
        .get(company.id) as { n: number };
      insights.push({
        type: "STALE_REPEAT_RECRUITER",
        priority: "MEDIUM",
        company_id: company.id,
        company_name: company.name,
        title: `Re-engage ${company.name}`,
        reason:
          daysSinceLastContact === null
            ? `A proven repeat recruiter with no recorded contact yet this cycle.`
            : `Repeat recruiter with ${hiringHistory.n} past hiring cycle(s), but last contact was ${daysSinceLastContact} days ago and nothing is scheduled.`,
        evidence: { hiringCycles: hiringHistory.n, daysSinceLastContact },
        recommended_action: "Contact the recruiter and ask about upcoming fresher requirements.",
      });
    }
  }

  const priorityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return insights.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}
