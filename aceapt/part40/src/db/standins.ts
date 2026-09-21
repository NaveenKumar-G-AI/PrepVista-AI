import { PoolClient } from 'pg';

/**
 * Raw queries against the migration-001 stand-in tables. Nothing in this file
 * is Feature-40-specific logic -- it exists ONLY because no real ACEAPT repo
 * was available to extend (see migration 001's header). Every function here
 * has a 1:1 real counterpart that a real integration would call instead; see
 * src/integrations/*.adapter.ts, which is the ONLY place that imports this
 * file. Nothing in src/services should import standins.ts directly.
 */

export interface StandinCareerDirection {
  targetRoleId: string;
  targetRoleTitle: string;
  targetRoleSlug: string;
  priority: number;
  status: string;
}

export async function getActiveCareerDirections(
  client: PoolClient,
  studentId: string
): Promise<StandinCareerDirection[]> {
  const { rows } = await client.query(
    `SELECT cd.target_role_id, r.title AS target_role_title, r.slug AS target_role_slug,
            cd.priority, cd.status
     FROM career_directions cd
     JOIN roles r ON r.id = cd.target_role_id
     WHERE cd.student_id = $1 AND cd.status IN ('ACTIVE','EXPLORATORY')
     ORDER BY cd.priority ASC`,
    [studentId]
  );
  return rows.map((r) => ({
    targetRoleId: r.target_role_id,
    targetRoleTitle: r.target_role_title,
    targetRoleSlug: r.target_role_slug,
    priority: r.priority,
    status: r.status,
  }));
}

export interface StandinEvidenceItem {
  id: string;
  skillId: string;
  skillName: string;
  skillSlug: string;
  evidenceType: string;
  strength: number;
  verified: boolean;
  title: string | null;
  createdAt: Date;
}

export async function getEvidenceForStudent(client: PoolClient, studentId: string): Promise<StandinEvidenceItem[]> {
  const { rows } = await client.query(
    `SELECT e.id, e.skill_id, s.name AS skill_name, s.slug AS skill_slug,
            e.evidence_type, e.strength, e.verified, e.title, e.created_at
     FROM evidence_items e
     JOIN skills s ON s.id = e.skill_id
     WHERE e.student_id = $1`,
    [studentId]
  );
  return rows.map((r) => ({
    id: r.id,
    skillId: r.skill_id,
    skillName: r.skill_name,
    skillSlug: r.skill_slug,
    evidenceType: r.evidence_type,
    strength: Number(r.strength),
    verified: r.verified,
    title: r.title,
    createdAt: r.created_at,
  }));
}

export interface StandinPositioning {
  headline: string | null;
  differentiators: string[];
}

export async function getPositioning(client: PoolClient, studentId: string): Promise<StandinPositioning | null> {
  const { rows } = await client.query(
    `SELECT headline, differentiators FROM positioning_snapshots
     WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [studentId]
  );
  if (rows.length === 0) return null;
  return { headline: rows[0].headline, differentiators: rows[0].differentiators ?? [] };
}

export interface StandinOpportunityRequirement {
  skillSlug: string;
  frequency: number; // fraction of opportunities for this role requiring the skill
  sampleSize: number;
}

/** Aggregates required_skills across opportunities for a role WITHIN A DATE
 * RANGE -- a cheap stand-in for Feature 39's opportunity intelligence, used
 * to build one period's market_snapshot (src/services/marketIntelligence
 * .service.ts). The date filter matters: opportunities has no period column,
 * only posted_at, so an earlier version of this query aggregated the whole
 * table regardless of which period was being ingested -- three periods of
 * seed data would have collapsed into one identical snapshot the first time
 * ingestSnapshot ran for more than one period. Caught by tracing the
 * ingestion path before seeding, fixed by requiring an explicit range. */
export async function getOpportunityRequirementFrequencies(
  client: PoolClient,
  roleId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<StandinOpportunityRequirement[]> {
  const { rows } = await client.query(
    `SELECT jsonb_array_elements_text(required_skills) AS skill_slug, count(*) AS cnt,
            (SELECT count(*) FROM opportunities WHERE role_id = $1 AND posted_at >= $2 AND posted_at < $3) AS total
     FROM opportunities
     WHERE role_id = $1 AND posted_at >= $2 AND posted_at < $3
     GROUP BY skill_slug`,
    [roleId, periodStart, periodEnd]
  );
  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  return rows.map((r) => ({
    skillSlug: r.skill_slug,
    frequency: total > 0 ? Number(r.cnt) / total : 0,
    sampleSize: total,
  }));
}

export interface StandinApplicationOutcome {
  opportunityId: string;
  roleId: string;
  status: string;
  outcome: string | null;
  createdAt: Date;
}

export async function getApplicationOutcomes(
  client: PoolClient,
  studentId: string
): Promise<StandinApplicationOutcome[]> {
  const { rows } = await client.query(
    `SELECT a.opportunity_id, o.role_id, a.status, a.outcome, a.created_at
     FROM applications a
     JOIN opportunities o ON o.id = a.opportunity_id
     WHERE a.student_id = $1`,
    [studentId]
  );
  return rows.map((r) => ({
    opportunityId: r.opportunity_id,
    roleId: r.role_id,
    status: r.status,
    outcome: r.outcome,
    createdAt: r.created_at,
  }));
}
