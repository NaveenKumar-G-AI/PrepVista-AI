import type { Pool, PoolClient } from "pg";
import { AiCoachingFeedback, CategoryScores, EngineeringEvidenceRow, EvaluationResult, IndependenceSummary } from "@/lib/engine/types";

type DB = Pool | PoolClient;

function mapEvaluation(r: Record<string, unknown>): EvaluationResult {
  return {
    incidentId: r.incident_id as string,
    version: Number(r.version),
    categoryScores: r.category_scores as CategoryScores,
    engineeringJudgment: Number(r.engineering_judgment),
    overall: Number(r.overall),
    topStrength: (r.top_strength as string) ?? "",
    topGap: (r.top_gap as string) ?? "",
    nextRecommendation: (r.next_recommendation as string) ?? "",
    independence: (r.independence as IndependenceSummary) ?? {
      hintsUsed: 0,
      assistanceModesUsed: [],
      rootCauseRevealed: false,
      aiCallsMade: 0,
      independentInvestigationRatio: 1,
    },
    aiFeedback: (r.ai_feedback as AiCoachingFeedback) ?? null,
  };
}

/**
 * Evaluations are append-only: a new call always inserts a new version
 * rather than overwriting a prior one ("IMMUTABLE EVALUATION" in the
 * brief). The API route is responsible for only calling this once per
 * incident under normal flow (gated by the POSTMORTEM -> EVALUATED state
 * transition); this function itself just guarantees whatever gets
 * inserted never clobbers history.
 */
export async function createEvaluation(
  db: DB,
  incidentId: string,
  ownerId: string,
  result: Omit<EvaluationResult, "version">
): Promise<EvaluationResult> {
  const res = await db.query(
    `insert into incident_evaluations (
       incident_id, owner_id, version, category_scores, engineering_judgment, overall,
       top_strength, top_gap, next_recommendation, ai_feedback, independence
     )
     select $1, $2, coalesce(max(version), 0) + 1, $3, $4, $5, $6, $7, $8, $9, $10
     from incident_evaluations where incident_id = $1
     returning *`,
    [
      incidentId,
      ownerId,
      JSON.stringify(result.categoryScores),
      result.engineeringJudgment,
      result.overall,
      result.topStrength,
      result.topGap,
      result.nextRecommendation,
      JSON.stringify(result.aiFeedback),
      JSON.stringify(result.independence),
    ]
  );
  return mapEvaluation(res.rows[0]);
}

export async function getLatestEvaluation(db: DB, incidentId: string): Promise<EvaluationResult | null> {
  const res = await db.query(
    "select * from incident_evaluations where incident_id = $1 order by version desc limit 1",
    [incidentId]
  );
  return res.rows[0] ? mapEvaluation(res.rows[0]) : null;
}

export async function listEvaluationVersions(db: DB, incidentId: string): Promise<EvaluationResult[]> {
  const res = await db.query("select * from incident_evaluations where incident_id = $1 order by version", [incidentId]);
  return res.rows.map(mapEvaluation);
}

export async function insertEvidence(
  db: DB,
  incidentId: string,
  ownerId: string,
  rows: EngineeringEvidenceRow[]
): Promise<void> {
  for (const row of rows) {
    await db.query("insert into incident_evidence (incident_id, owner_id, category, payload) values ($1,$2,$3,$4)", [
      incidentId,
      ownerId,
      row.category,
      JSON.stringify(row.payload),
    ]);
  }
}

export async function listEvidence(db: DB, ownerId: string): Promise<{ category: string; payload: Record<string, unknown>; createdAt: string }[]> {
  const res = await db.query("select category, payload, created_at from incident_evidence where owner_id = $1 order by created_at desc", [
    ownerId,
  ]);
  return res.rows.map((r) => ({ category: r.category, payload: r.payload, createdAt: r.created_at }));
}
