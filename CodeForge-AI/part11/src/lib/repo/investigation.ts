import type { Pool, PoolClient } from "pg";
import {
  ActionLogRow,
  ActionType,
  HypothesisCategory,
  HypothesisRow,
  IncidentEventRow,
  MessageRow,
} from "@/lib/engine/types";

type DB = Pool | PoolClient;

// ---------------------------------------------------------------
// Events (the investigation event log — this is what evaluation reads)
// ---------------------------------------------------------------

function mapEvent(r: Record<string, unknown>): IncidentEventRow {
  return {
    id: r.id as string,
    incidentId: r.incident_id as string,
    actorId: r.actor_id as string,
    eventType: r.event_type as string,
    payload: (r.payload as Record<string, unknown>) ?? {},
    simMinutesAt: Number(r.sim_minutes_at),
    createdAt: r.created_at as string,
  };
}

export async function recordEvent(
  db: DB,
  incidentId: string,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
  simMinutesAt: number
): Promise<IncidentEventRow> {
  const res = await db.query(
    `insert into incident_events (incident_id, actor_id, event_type, payload, sim_minutes_at)
     values ($1,$2,$3,$4,$5) returning *`,
    [incidentId, actorId, eventType, JSON.stringify(payload), simMinutesAt]
  );
  return mapEvent(res.rows[0]);
}

export async function listEvents(db: DB, incidentId: string): Promise<IncidentEventRow[]> {
  const res = await db.query("select * from incident_events where incident_id = $1 order by sim_minutes_at, created_at", [
    incidentId,
  ]);
  return res.rows.map(mapEvent);
}

// ---------------------------------------------------------------
// Hypotheses
// ---------------------------------------------------------------

function mapHypothesis(r: Record<string, unknown>): HypothesisRow {
  return {
    id: r.id as string,
    incidentId: r.incident_id as string,
    ownerId: r.owner_id as string,
    statement: r.statement as string,
    category: r.category as HypothesisCategory,
    implicatedCauseKey: r.implicated_cause_key as string,
    evidenceRefs: (r.evidence_refs as string[]) ?? [],
    status: r.status as HypothesisRow["status"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function createHypothesis(
  db: DB,
  incidentId: string,
  ownerId: string,
  input: { statement: string; category: HypothesisCategory; implicatedCauseKey: string; evidenceRefs: string[] }
): Promise<HypothesisRow> {
  const res = await db.query(
    `insert into incident_hypotheses (incident_id, owner_id, statement, category, implicated_cause_key, evidence_refs)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [incidentId, ownerId, input.statement, input.category, input.implicatedCauseKey, input.evidenceRefs]
  );
  return mapHypothesis(res.rows[0]);
}

export async function listHypotheses(db: DB, incidentId: string): Promise<HypothesisRow[]> {
  const res = await db.query("select * from incident_hypotheses where incident_id = $1 order by created_at", [incidentId]);
  return res.rows.map(mapHypothesis);
}

export async function updateHypothesisStatus(
  db: DB,
  hypothesisId: string,
  status: HypothesisRow["status"],
  evidenceRefs?: string[]
): Promise<HypothesisRow> {
  const res = await db.query(
    `update incident_hypotheses
       set status = $1, evidence_refs = coalesce($2, evidence_refs), updated_at = now()
     where id = $3
     returning *`,
    [status, evidenceRefs ?? null, hypothesisId]
  );
  return mapHypothesis(res.rows[0]);
}

// ---------------------------------------------------------------
// Action log — idempotent by (incident_id, idempotency_key)
// ---------------------------------------------------------------

function mapAction(r: Record<string, unknown>): ActionLogRow {
  return {
    id: r.id as string,
    incidentId: r.incident_id as string,
    ownerId: r.owner_id as string,
    actionType: r.action_type as ActionType,
    targetServiceKey: (r.target_service_key as string) ?? null,
    idempotencyKey: r.idempotency_key as string,
    params: (r.params as Record<string, unknown>) ?? {},
    result: (r.result as Record<string, unknown>) ?? {},
    simMinutesAt: Number(r.sim_minutes_at),
    createdAt: r.created_at as string,
  };
}

/**
 * Returns { row, wasNew }. If a row already exists for this
 * (incident_id, idempotency_key) pair, that existing row is returned
 * unchanged and wasNew=false — callers use this to skip re-applying
 * consequences on a duplicate/retried request (see brief: "Duplicate
 * action request. Expected: idempotent behavior.").
 */
export async function recordActionIfNew(
  db: DB,
  incidentId: string,
  ownerId: string,
  input: {
    actionType: ActionType;
    targetServiceKey: string | null;
    idempotencyKey: string;
    params: Record<string, unknown>;
    result: Record<string, unknown>;
    simMinutesAt: number;
  }
): Promise<{ row: ActionLogRow; wasNew: boolean }> {
  const inserted = await db.query(
    `insert into incident_action_log (incident_id, owner_id, action_type, target_service_key, idempotency_key, params, result, sim_minutes_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (incident_id, idempotency_key) do nothing
     returning *`,
    [
      incidentId,
      ownerId,
      input.actionType,
      input.targetServiceKey,
      input.idempotencyKey,
      JSON.stringify(input.params),
      JSON.stringify(input.result),
      input.simMinutesAt,
    ]
  );
  if (inserted.rows[0]) {
    return { row: mapAction(inserted.rows[0]), wasNew: true };
  }
  const existing = await db.query(
    "select * from incident_action_log where incident_id = $1 and idempotency_key = $2",
    [incidentId, input.idempotencyKey]
  );
  return { row: mapAction(existing.rows[0]), wasNew: false };
}

export async function listActions(db: DB, incidentId: string): Promise<ActionLogRow[]> {
  const res = await db.query("select * from incident_action_log where incident_id = $1 order by sim_minutes_at, created_at", [
    incidentId,
  ]);
  return res.rows.map(mapAction);
}

// ---------------------------------------------------------------
// Messages
// ---------------------------------------------------------------

function mapMessage(r: Record<string, unknown>): MessageRow {
  return {
    id: r.id as string,
    incidentId: r.incident_id as string,
    ownerId: r.owner_id as string,
    sender: r.sender as string,
    direction: r.direction as MessageRow["direction"],
    body: (r.body as Record<string, unknown>) ?? {},
    simMinutesAt: Number(r.sim_minutes_at),
    createdAt: r.created_at as string,
  };
}

export async function createMessage(
  db: DB,
  incidentId: string,
  ownerId: string,
  input: { sender: string; direction: MessageRow["direction"]; body: Record<string, unknown>; simMinutesAt: number }
): Promise<MessageRow> {
  const res = await db.query(
    `insert into incident_messages (incident_id, owner_id, sender, direction, body, sim_minutes_at)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [incidentId, ownerId, input.sender, input.direction, JSON.stringify(input.body), input.simMinutesAt]
  );
  return mapMessage(res.rows[0]);
}

export async function listMessages(db: DB, incidentId: string): Promise<MessageRow[]> {
  const res = await db.query("select * from incident_messages where incident_id = $1 order by sim_minutes_at, created_at", [
    incidentId,
  ]);
  return res.rows.map(mapMessage);
}
