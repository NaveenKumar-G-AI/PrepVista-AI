import type { Pool, PoolClient } from "pg";
import { IncidentInstance, IncidentState } from "@/lib/engine/types";
import { NotFoundError } from "./authz";

type DB = Pool | PoolClient;

function mapInstance(r: Record<string, unknown>): IncidentInstance {
  return {
    id: r.id as string,
    templateId: r.template_id as string,
    ownerId: r.owner_id as string,
    code: r.code as string,
    state: r.state as IncidentState,
    simStartedAt: (r.sim_started_at as string) ?? null,
    simMinutesElapsed: Number(r.sim_minutes_elapsed),
    escalationLevel: Number(r.escalation_level),
    mitigated: r.mitigated as boolean,
    permanentFixApplied: r.permanent_fix_applied as boolean,
    verified: r.verified as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function generateCode(): string {
  // Cosmetic display code only — not simulation data, so Math.random is
  // fine here (see README "Determinism" note: reproducibility applies to
  // simulation/evaluation outcomes, not to this label).
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `PF-${n}`;
}

export async function createIncidentInstance(db: DB, ownerId: string, templateId: string): Promise<IncidentInstance> {
  const res = await db.query(
    `insert into incidents (template_id, owner_id, code, state, sim_started_at)
     values ($1, $2, $3, 'CREATED', now())
     returning *`,
    [templateId, ownerId, generateCode()]
  );
  return mapInstance(res.rows[0]);
}

export async function getIncidentInstance(db: DB, incidentId: string): Promise<IncidentInstance> {
  const res = await db.query("select * from incidents where id = $1", [incidentId]);
  if (!res.rows[0]) throw new NotFoundError("Incident");
  return mapInstance(res.rows[0]);
}

export async function listIncidentInstancesForUser(db: DB, ownerId: string): Promise<IncidentInstance[]> {
  const res = await db.query("select * from incidents where owner_id = $1 order by created_at desc", [ownerId]);
  return res.rows.map(mapInstance);
}

export interface InstancePatch {
  state?: IncidentState;
  simMinutesElapsed?: number;
  escalationLevel?: number;
  mitigated?: boolean;
  permanentFixApplied?: boolean;
  verified?: boolean;
}

export async function updateIncidentInstance(db: DB, incidentId: string, patch: InstancePatch): Promise<IncidentInstance> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const fieldMap: Record<string, unknown> = {
    state: patch.state,
    sim_minutes_elapsed: patch.simMinutesElapsed,
    escalation_level: patch.escalationLevel,
    mitigated: patch.mitigated,
    permanent_fix_applied: patch.permanentFixApplied,
    verified: patch.verified,
  };
  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      sets.push(`${col} = $${i}`);
      values.push(val);
      i += 1;
    }
  }
  sets.push(`updated_at = now()`);
  values.push(incidentId);

  const res = await db.query(`update incidents set ${sets.join(", ")} where id = $${i} returning *`, values);
  if (!res.rows[0]) throw new NotFoundError("Incident");
  return mapInstance(res.rows[0]);
}
