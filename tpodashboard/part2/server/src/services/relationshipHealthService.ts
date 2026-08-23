import type Database from "better-sqlite3";
import type { CompanyRow, RelationshipHealth, RelationshipStage } from "../types.js";

export interface HealthInput {
  relationshipStage: RelationshipStage;
  daysSinceLastContact: number | null;
  overdueFollowupCount: number;
  openFollowupCount: number;
}

export interface HealthResult {
  health: RelationshipHealth;
  reason: string;
}

/**
 * Deterministic rule-based health, not an opaque AI score (spec Phase 6: "Do NOT use an
 * opaque AI-only score. Create a transparent rule/service layer."). Every branch returns
 * a plain-language reason built only from facts this function was actually given.
 *
 * `job_requirement` and `drive` signals (active requirement, recent drive) aren't wired
 * in yet because those tables belong to Part 3 — see companyService.getCompanyDrives.
 * When they exist, thread them in here as additional optional inputs rather than
 * inferring them from anything else.
 */
export function computeRelationshipHealth(input: HealthInput): HealthResult {
  const { relationshipStage, daysSinceLastContact, overdueFollowupCount } = input;

  if (relationshipStage === "INACTIVE") {
    return { health: "INACTIVE", reason: "Relationship stage is set to Inactive." };
  }

  if (daysSinceLastContact === null) {
    return { health: "NEUTRAL", reason: "No interactions have been recorded yet." };
  }

  if (overdueFollowupCount >= 2 || (overdueFollowupCount >= 1 && daysSinceLastContact > 45)) {
    return {
      health: "AT_RISK",
      reason: `${overdueFollowupCount} follow-up${overdueFollowupCount === 1 ? "" : "s"} overdue and last contact was ${daysSinceLastContact} day${daysSinceLastContact === 1 ? "" : "s"} ago.`,
    };
  }

  if (overdueFollowupCount >= 1) {
    return {
      health: "COOLING",
      reason: `Last recorded interaction was ${daysSinceLastContact} day${daysSinceLastContact === 1 ? "" : "s"} ago and ${overdueFollowupCount} follow-up${overdueFollowupCount === 1 ? " is" : "s are"} overdue.`,
    };
  }

  if (daysSinceLastContact > 21) {
    return {
      health: "COOLING",
      reason: `Last contact was ${daysSinceLastContact} days ago, with no overdue follow-ups but nothing recent either.`,
    };
  }

  if (daysSinceLastContact <= 7) {
    return { health: "STRONG", reason: `Last contact was ${daysSinceLastContact} day${daysSinceLastContact === 1 ? "" : "s"} ago with no overdue follow-ups.` };
  }

  return { health: "HEALTHY", reason: `Last contact was ${daysSinceLastContact} days ago with no overdue follow-ups.` };
}

/**
 * "Repeat recruiter" must be derivable from history or explicitly recorded (spec: "Do not
 * make 'repeat recruiter' merely a decorative label"). This is true if either:
 *  (a) a TPO explicitly set the stage to REPEAT_RECRUITER (provenance: company_status_history), or
 *  (b) the company's status history shows it reached HIRING more than once (derived from real history).
 */
export function isRepeatRecruiter(db: Database.Database, company: CompanyRow): boolean {
  if (company.relationship_stage === "REPEAT_RECRUITER") return true;
  const hiringTransitions = db
    .prepare(`select count(*) as n from company_status_history where company_id = ? and new_stage = 'HIRING'`)
    .get(company.id) as { n: number };
  return hiringTransitions.n >= 2;
}
