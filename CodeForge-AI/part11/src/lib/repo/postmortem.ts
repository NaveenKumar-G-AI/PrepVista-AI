import type { Pool, PoolClient } from "pg";
import { PostmortemRow } from "@/lib/engine/types";

type DB = Pool | PoolClient;

function mapPostmortem(r: Record<string, unknown>): PostmortemRow {
  return {
    id: r.id as string,
    incidentId: r.incident_id as string,
    ownerId: r.owner_id as string,
    summary: (r.summary as string) ?? null,
    businessImpact: (r.business_impact as string) ?? null,
    timeline: (r.timeline as string) ?? null,
    rootCause: (r.root_cause as string) ?? null,
    contributingFactors: (r.contributing_factors as string) ?? null,
    detection: (r.detection as string) ?? null,
    mitigation: (r.mitigation as string) ?? null,
    permanentFix: (r.permanent_fix as string) ?? null,
    whatWentWell: (r.what_went_well as string) ?? null,
    whatWentWrong: (r.what_went_wrong as string) ?? null,
    preventiveActionKeys: (r.preventive_action_keys as string[]) ?? [],
    preventiveActionsNotes: (r.preventive_actions_notes as string) ?? null,
    fiveWhys: (r.five_whys as string[]) ?? [],
    status: r.status as PostmortemRow["status"],
    submittedAt: (r.submitted_at as string) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function getPostmortem(db: DB, incidentId: string): Promise<PostmortemRow | null> {
  const res = await db.query("select * from incident_postmortems where incident_id = $1", [incidentId]);
  return res.rows[0] ? mapPostmortem(res.rows[0]) : null;
}

export type PostmortemFieldsInput = Partial<
  Pick<
    PostmortemRow,
    | "summary"
    | "businessImpact"
    | "timeline"
    | "rootCause"
    | "contributingFactors"
    | "detection"
    | "mitigation"
    | "permanentFix"
    | "whatWentWell"
    | "whatWentWrong"
    | "preventiveActionKeys"
    | "preventiveActionsNotes"
    | "fiveWhys"
  >
>;

export async function upsertPostmortemDraft(
  db: DB,
  incidentId: string,
  ownerId: string,
  fields: PostmortemFieldsInput
): Promise<PostmortemRow> {
  const res = await db.query(
    `insert into incident_postmortems (
       incident_id, owner_id, summary, business_impact, timeline, root_cause, contributing_factors,
       detection, mitigation, permanent_fix, what_went_well, what_went_wrong,
       preventive_action_keys, preventive_actions_notes, five_whys
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (incident_id) do update set
       summary = coalesce(excluded.summary, incident_postmortems.summary),
       business_impact = coalesce(excluded.business_impact, incident_postmortems.business_impact),
       timeline = coalesce(excluded.timeline, incident_postmortems.timeline),
       root_cause = coalesce(excluded.root_cause, incident_postmortems.root_cause),
       contributing_factors = coalesce(excluded.contributing_factors, incident_postmortems.contributing_factors),
       detection = coalesce(excluded.detection, incident_postmortems.detection),
       mitigation = coalesce(excluded.mitigation, incident_postmortems.mitigation),
       permanent_fix = coalesce(excluded.permanent_fix, incident_postmortems.permanent_fix),
       what_went_well = coalesce(excluded.what_went_well, incident_postmortems.what_went_well),
       what_went_wrong = coalesce(excluded.what_went_wrong, incident_postmortems.what_went_wrong),
       preventive_action_keys = coalesce(excluded.preventive_action_keys, incident_postmortems.preventive_action_keys),
       preventive_actions_notes = coalesce(excluded.preventive_actions_notes, incident_postmortems.preventive_actions_notes),
       five_whys = coalesce(excluded.five_whys, incident_postmortems.five_whys),
       updated_at = now()
     returning *`,
    [
      incidentId,
      ownerId,
      fields.summary ?? null,
      fields.businessImpact ?? null,
      fields.timeline ?? null,
      fields.rootCause ?? null,
      fields.contributingFactors ?? null,
      fields.detection ?? null,
      fields.mitigation ?? null,
      fields.permanentFix ?? null,
      fields.whatWentWell ?? null,
      fields.whatWentWrong ?? null,
      fields.preventiveActionKeys ?? null,
      fields.preventiveActionsNotes ?? null,
      fields.fiveWhys ?? null,
    ]
  );
  return mapPostmortem(res.rows[0]);
}

export async function submitPostmortem(db: DB, incidentId: string): Promise<PostmortemRow> {
  const res = await db.query(
    `update incident_postmortems set status = 'SUBMITTED', submitted_at = now(), updated_at = now()
     where incident_id = $1 returning *`,
    [incidentId]
  );
  return mapPostmortem(res.rows[0]);
}
