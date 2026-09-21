import type { GrowthRepository } from "./repository.ts";
import type { GrowthEvidence, GrowthSnapshot, GrowthMilestone, GrowthInsight, GrowthDimension } from "../types.ts";

type QueryFn = <T = Record<string, unknown>>(sql: string, params: unknown[]) => Promise<T[]>;

export interface PostgresRepositoryDeps {
  /** Runs on a privileged connection that bypasses RLS (Supabase
   * `service_role` equivalent). Used ONLY for: (a) writes, because growth
   * state must always be server-authoritative and never client-writable,
   * and (b) the instructor-authorization lookup itself, which by
   * definition has to see across students to decide who's enrolled with
   * whom. Never expose this query function to request-handling code
   * directly — only this repository module should hold it. */
  serviceQuery: QueryFn;
  /** Runs on a connection scoped to a specific authenticated user
   * (`SET LOCAL` of the auth claim, executing as the `authenticated`
   * Postgres role) so Postgres RLS itself enforces the student/instructor
   * boundary — a second, independent layer beneath the API's own
   * authorization checks. Used for all reads. */
  authenticatedQuery: QueryFn;
}

function rowToEvidence(row: Record<string, unknown>): GrowthEvidence {
  return {
    evidenceId: row.evidence_id as string,
    studentId: row.student_id as string,
    dimension: row.dimension as GrowthDimension,
    sourceType: row.source_type as GrowthEvidence["sourceType"],
    sourceId: row.source_id as string,
    outcome: row.outcome as GrowthEvidence["outcome"],
    sourceConfidence: Number(row.source_confidence),
    assistanceLevel: row.assistance_level as GrowthEvidence["assistanceLevel"],
    difficulty: (row.difficulty as GrowthEvidence["difficulty"]) ?? null,
    isTransfer: Boolean(row.is_transfer),
    isRetentionCheck: Boolean(row.is_retention_check),
    challengeFamily: (row.challenge_family as string) ?? null,
    roleContext: (row.role_context as string) ?? null,
    occurredAt: new Date(row.occurred_at as string).toISOString(),
    recordedAt: new Date(row.recorded_at as string).toISOString(),
    evidenceVersion: row.evidence_version as string,
    context: (row.context as Record<string, unknown>) ?? {},
  };
}

function rowToSnapshot(row: Record<string, unknown>): GrowthSnapshot {
  return {
    snapshotId: row.snapshot_id as string,
    studentId: row.student_id as string,
    roleContext: (row.role_context as string) ?? null,
    dimensions: row.dimensions as GrowthSnapshot["dimensions"],
    overallState: row.overall_state as GrowthSnapshot["overallState"],
    overallConfidence: row.overall_confidence as GrowthSnapshot["overallConfidence"],
    activityLevel: row.activity_level as GrowthSnapshot["activityLevel"],
    evidenceWindow: row.evidence_window as GrowthSnapshot["evidenceWindow"],
    generatedAt: new Date(row.generated_at as string).toISOString(),
    studentModelVersion: row.student_model_version as string,
    skillModelVersion: row.skill_model_version as string,
    growthEngineVersion: row.growth_engine_version as string,
    rulesVersion: row.rules_version as string,
  };
}

function rowToMilestone(row: Record<string, unknown>): GrowthMilestone {
  return {
    milestoneKey: row.milestone_key as string,
    milestoneId: row.milestone_id as string,
    studentId: row.student_id as string,
    dimension: row.dimension as GrowthDimension,
    milestoneType: row.milestone_type as GrowthMilestone["milestoneType"],
    sourceEvidenceId: row.source_evidence_id as string,
    occurredAt: new Date(row.occurred_at as string).toISOString(),
    rulesVersion: row.rules_version as string,
  };
}

function rowToInsight(row: Record<string, unknown>): GrowthInsight {
  return {
    insightId: row.insight_id as string,
    studentId: row.student_id as string,
    insightType: row.insight_type as GrowthInsight["insightType"],
    dimension: row.dimension as GrowthDimension,
    claim: row.claim as string,
    evidenceRefs: row.evidence_refs as string[],
    confidence: row.confidence as GrowthInsight["confidence"],
    recommendedAction: (row.recommended_action as GrowthInsight["recommendedAction"]) ?? null,
    generatedAt: new Date(row.generated_at as string).toISOString(),
    rulesVersion: row.rules_version as string,
    assessmentSafe: Boolean(row.assessment_safe),
  };
}

export function createPostgresGrowthRepository(deps: PostgresRepositoryDeps): GrowthRepository {
  return {
    async insertEvidence(evidence) {
      await deps.serviceQuery(
        `insert into growth_evidence
          (evidence_id, student_id, dimension, source_type, source_id, outcome, source_confidence,
           assistance_level, difficulty, is_transfer, is_retention_check, challenge_family, role_context,
           occurred_at, recorded_at, evidence_version, context)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (evidence_id) do nothing`,
        [
          evidence.evidenceId, evidence.studentId, evidence.dimension, evidence.sourceType, evidence.sourceId,
          evidence.outcome, evidence.sourceConfidence, evidence.assistanceLevel, evidence.difficulty,
          evidence.isTransfer, evidence.isRetentionCheck, evidence.challengeFamily, evidence.roleContext,
          evidence.occurredAt, evidence.recordedAt, evidence.evidenceVersion, JSON.stringify(evidence.context),
        ],
      );
    },

    async getEvidenceForStudent(studentId, opts) {
      const clauses = ["student_id = $1"];
      const params: unknown[] = [studentId];
      if (opts?.dimension) {
        params.push(opts.dimension);
        clauses.push(`dimension = $${params.length}`);
      }
      if (opts?.since) {
        params.push(opts.since);
        clauses.push(`occurred_at >= $${params.length}`);
      }
      const rows = await deps.authenticatedQuery(
        `select * from growth_evidence where ${clauses.join(" and ")} order by occurred_at asc`,
        params,
      );
      return rows.map(rowToEvidence);
    },

    async insertSnapshot(snapshot) {
      await deps.serviceQuery(
        `insert into growth_snapshots
          (snapshot_id, student_id, role_context, dimensions, overall_state, overall_confidence, activity_level,
           evidence_window, generated_at, student_model_version, skill_model_version, growth_engine_version, rules_version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (snapshot_id) do nothing`,
        [
          snapshot.snapshotId, snapshot.studentId, snapshot.roleContext, JSON.stringify(snapshot.dimensions),
          snapshot.overallState, snapshot.overallConfidence, snapshot.activityLevel, JSON.stringify(snapshot.evidenceWindow),
          snapshot.generatedAt, snapshot.studentModelVersion, snapshot.skillModelVersion, snapshot.growthEngineVersion, snapshot.rulesVersion,
        ],
      );
    },

    async getLatestSnapshot(studentId) {
      const rows = await deps.authenticatedQuery(
        `select * from growth_snapshots where student_id = $1 order by generated_at desc limit 1`,
        [studentId],
      );
      return rows[0] ? rowToSnapshot(rows[0]) : null;
    },

    async getSnapshotHistory(studentId, limit) {
      const rows = await deps.authenticatedQuery(
        `select * from growth_snapshots where student_id = $1 order by generated_at desc limit $2`,
        [studentId, limit],
      );
      return rows.map(rowToSnapshot);
    },

    async upsertMilestones(milestones) {
      const inserted: GrowthMilestone[] = [];
      for (const m of milestones) {
        const rows = await deps.serviceQuery(
          `insert into growth_milestones (milestone_key, milestone_id, student_id, dimension, milestone_type, source_evidence_id, occurred_at, rules_version)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (milestone_key) do nothing
           returning *`,
          [m.milestoneKey, m.milestoneId, m.studentId, m.dimension, m.milestoneType, m.sourceEvidenceId, m.occurredAt, m.rulesVersion],
        );
        if (rows[0]) inserted.push(rowToMilestone(rows[0]));
      }
      return inserted;
    },

    async getMilestones(studentId) {
      const rows = await deps.authenticatedQuery(`select * from growth_milestones where student_id = $1 order by occurred_at asc`, [studentId]);
      return rows.map(rowToMilestone);
    },

    async insertInsights(insights) {
      for (const i of insights) {
        await deps.serviceQuery(
          `insert into growth_insights (insight_id, student_id, insight_type, dimension, claim, evidence_refs, confidence, recommended_action, generated_at, rules_version, assessment_safe)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           on conflict (insight_id) do nothing`,
          [
            i.insightId, i.studentId, i.insightType, i.dimension, i.claim, JSON.stringify(i.evidenceRefs),
            i.confidence, i.recommendedAction ? JSON.stringify(i.recommendedAction) : null, i.generatedAt, i.rulesVersion, i.assessmentSafe,
          ],
        );
      }
    },

    async getRecentInsights(studentId, limit) {
      const rows = await deps.authenticatedQuery(
        `select * from growth_insights where student_id = $1 order by generated_at desc limit $2`,
        [studentId, limit],
      );
      return rows.map(rowToInsight);
    },

    async isAuthorizedInstructor(instructorId, studentId) {
      const rows = await deps.serviceQuery(
        `select 1 from course_enrollments where instructor_id = $1 and student_id = $2 and role = 'instructor' limit 1`,
        [instructorId, studentId],
      );
      return rows.length > 0;
    },
  };
}
