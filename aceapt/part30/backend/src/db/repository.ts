import type { PoolClient } from "pg";
import type {
  Capability,
  EvidenceEvent,
  PathAction,
  PathMilestone,
  PathRisk,
  PathSnapshot,
  PathStage,
  PathState,
  StudentCapabilityState,
  Target,
  TargetRequirement,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Capabilities / targets / requirements
// ---------------------------------------------------------------------------

export async function getCapabilities(c: PoolClient, codes?: string[]): Promise<Capability[]> {
  const { rows } = codes
    ? await c.query("SELECT code, name, category FROM capabilities WHERE code = ANY($1)", [codes])
    : await c.query("SELECT code, name, category FROM capabilities");
  return rows;
}

export async function getTarget(c: PoolClient, targetId: string): Promise<Target | null> {
  const { rows } = await c.query(
    "SELECT id, code, name, description FROM targets WHERE id = $1",
    [targetId]
  );
  return rows[0] ?? null;
}

export async function getTargetRequirements(c: PoolClient, targetId: string): Promise<TargetRequirement[]> {
  const { rows } = await c.query(
    `SELECT target_id AS "targetId", capability_code AS "capabilityCode",
            required_level AS "requiredLevel", weight, min_evidence AS "minEvidence"
     FROM target_requirements WHERE target_id = $1`,
    [targetId]
  );
  return rows.map((r) => ({ ...r, requiredLevel: Number(r.requiredLevel), weight: Number(r.weight) }));
}

// ---------------------------------------------------------------------------
// Student capability state / evidence
// ---------------------------------------------------------------------------

export async function getStudentCapabilityStates(
  c: PoolClient,
  studentId: string
): Promise<StudentCapabilityState[]> {
  const { rows } = await c.query(
    `SELECT student_id AS "studentId", capability_code AS "capabilityCode",
            level, accuracy, speed, transfer, consistency,
            evidence_count AS "evidenceCount", last_evidence_at AS "lastEvidenceAt"
     FROM student_capability_state WHERE student_id = $1`,
    [studentId]
  );
  return rows.map((r) => ({
    ...r,
    level: Number(r.level),
    accuracy: Number(r.accuracy),
    speed: Number(r.speed),
    transfer: Number(r.transfer),
    consistency: Number(r.consistency),
  }));
}

export async function upsertCapabilityState(c: PoolClient, s: StudentCapabilityState): Promise<void> {
  await c.query(
    `INSERT INTO student_capability_state
       (student_id, capability_code, level, accuracy, speed, transfer, consistency, evidence_count, last_evidence_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (student_id, capability_code) DO UPDATE SET
       level = EXCLUDED.level, accuracy = EXCLUDED.accuracy, speed = EXCLUDED.speed,
       transfer = EXCLUDED.transfer, consistency = EXCLUDED.consistency,
       evidence_count = EXCLUDED.evidence_count, last_evidence_at = EXCLUDED.last_evidence_at`,
    [s.studentId, s.capabilityCode, s.level, s.accuracy, s.speed, s.transfer, s.consistency, s.evidenceCount, s.lastEvidenceAt]
  );
}

export async function insertEvidenceEvent(c: PoolClient, e: Omit<EvidenceEvent, "id">): Promise<EvidenceEvent> {
  const { rows } = await c.query(
    `INSERT INTO evidence_events (student_id, capability_code, type, source, result, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, student_id AS "studentId", capability_code AS "capabilityCode", type, source, result, occurred_at AS "occurredAt"`,
    [e.studentId, e.capabilityCode, e.type, e.source, JSON.stringify(e.result), e.occurredAt]
  );
  return rows[0];
}

export async function getRecentEvidence(
  c: PoolClient,
  studentId: string,
  capabilityCode: string,
  limit = 10
): Promise<EvidenceEvent[]> {
  const { rows } = await c.query(
    `SELECT id, student_id AS "studentId", capability_code AS "capabilityCode", type, source, result, occurred_at AS "occurredAt"
     FROM evidence_events WHERE student_id = $1 AND capability_code = $2
     ORDER BY occurred_at DESC LIMIT $3`,
    [studentId, capabilityCode, limit]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Path aggregate
// ---------------------------------------------------------------------------

function mapPathRow(r: Record<string, any>): PathState {
  return {
    id: r.id,
    studentId: r.studentId,
    targetId: r.targetId,
    slot: r.slot,
    mode: r.mode,
    status: r.status,
    currentStageId: r.currentStageId,
    readiness: Number(r.readiness),
    targetReadiness: Number(r.targetReadiness),
    bottleneck: null, // filled by caller (bottleneck engine), not stored redundantly beyond the capability code
    deadlineDays: r.deadlineDays,
    lastRecalculatedAt: r.lastRecalculatedAt,
    createdAt: r.createdAt,
  };
}

export async function getPathByStudentAndTarget(
  c: PoolClient,
  studentId: string,
  targetId: string
): Promise<(PathState & { currentBottleneckCode: string | null }) | null> {
  const { rows } = await c.query(
    `SELECT id, student_id AS "studentId", target_id AS "targetId", slot, mode, status,
            current_stage_id AS "currentStageId", current_bottleneck AS "currentBottleneckCode",
            readiness, target_readiness AS "targetReadiness", deadline_days AS "deadlineDays",
            last_recalculated_at AS "lastRecalculatedAt", created_at AS "createdAt"
     FROM paths WHERE student_id = $1 AND target_id = $2`,
    [studentId, targetId]
  );
  if (!rows[0]) return null;
  return { ...mapPathRow(rows[0]), currentBottleneckCode: rows[0].currentBottleneckCode };
}

export async function getActivePathForStudent(
  c: PoolClient,
  studentId: string
): Promise<(PathState & { currentBottleneckCode: string | null }) | null> {
  const { rows } = await c.query(
    `SELECT id, student_id AS "studentId", target_id AS "targetId", slot, mode, status,
            current_stage_id AS "currentStageId", current_bottleneck AS "currentBottleneckCode",
            readiness, target_readiness AS "targetReadiness", deadline_days AS "deadlineDays",
            last_recalculated_at AS "lastRecalculatedAt", created_at AS "createdAt"
     FROM paths WHERE student_id = $1 AND slot = 'PRIMARY' AND status = 'ACTIVE'
     ORDER BY created_at DESC LIMIT 1`,
    [studentId]
  );
  if (!rows[0]) return null;
  return { ...mapPathRow(rows[0]), currentBottleneckCode: rows[0].currentBottleneckCode };
}

export async function createPath(
  c: PoolClient,
  input: { tenantId: string; studentId: string; targetId: string; slot: string; deadlineDays: number | null; mode: string; targetReadiness: number }
): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO paths (tenant_id, student_id, target_id, slot, deadline_days, mode, target_readiness)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.tenantId, input.studentId, input.targetId, input.slot, input.deadlineDays, input.mode, input.targetReadiness]
  );
  return rows[0].id;
}

export async function updatePathState(
  c: PoolClient,
  pathId: string,
  fields: Partial<{
    mode: string;
    status: string;
    currentStageId: string | null;
    currentBottleneck: string | null;
    readiness: number;
    deadlineDays: number | null;
  }>
): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    mode: "mode",
    status: "status",
    currentStageId: "current_stage_id",
    currentBottleneck: "current_bottleneck",
    readiness: "readiness",
    deadlineDays: "deadline_days",
  };
  for (const [k, v] of Object.entries(fields)) {
    cols.push(`${map[k]} = $${i++}`);
    vals.push(v);
  }
  if (cols.length === 0) return;
  cols.push(`last_recalculated_at = now()`);
  vals.push(pathId);
  await c.query(`UPDATE paths SET ${cols.join(", ")} WHERE id = $${i}`, vals);
}

// ---------------------------------------------------------------------------
// Stages / milestones / actions / risks / snapshots
// ---------------------------------------------------------------------------

export async function getStages(c: PoolClient, pathId: string): Promise<PathStage[]> {
  const { rows } = await c.query(
    `SELECT id, path_id AS "pathId", key, name, sequence, status FROM path_stages WHERE path_id = $1 ORDER BY sequence`,
    [pathId]
  );
  return rows;
}

export async function insertStage(c: PoolClient, tenantId: string, s: Omit<PathStage, "id">): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO path_stages (tenant_id, path_id, key, name, sequence, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [tenantId, s.pathId, s.key, s.name, s.sequence, s.status]
  );
  return rows[0].id;
}

export async function updateStageStatus(c: PoolClient, stageId: string, status: string): Promise<void> {
  await c.query(`UPDATE path_stages SET status = $1 WHERE id = $2`, [status, stageId]);
}

export async function getMilestones(c: PoolClient, pathId: string): Promise<PathMilestone[]> {
  const { rows } = await c.query(
    `SELECT id, path_id AS "pathId", stage_id AS "stageId", name,
            required_capabilities AS "requiredCapabilities", evidence_requirements AS "evidenceRequirements",
            status, priority, critical, created_at AS "createdAt", verified_at AS "verifiedAt"
     FROM path_milestones WHERE path_id = $1 ORDER BY priority, created_at`,
    [pathId]
  );
  return rows;
}

export async function insertMilestone(c: PoolClient, tenantId: string, m: Omit<PathMilestone, "id" | "createdAt" | "verifiedAt">): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO path_milestones (tenant_id, path_id, stage_id, name, required_capabilities, evidence_requirements, status, priority, critical)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [tenantId, m.pathId, m.stageId, m.name, JSON.stringify(m.requiredCapabilities), JSON.stringify(m.evidenceRequirements), m.status, m.priority, m.critical]
  );
  return rows[0].id;
}

export async function updateMilestoneStatus(c: PoolClient, milestoneId: string, status: string, verifiedAt?: string | null): Promise<void> {
  await c.query(`UPDATE path_milestones SET status = $1, verified_at = COALESCE($2, verified_at) WHERE id = $3`, [
    status,
    verifiedAt ?? null,
    milestoneId,
  ]);
}

export async function getActions(c: PoolClient, pathId: string, status?: string): Promise<PathAction[]> {
  const { rows } = status
    ? await c.query(
        `SELECT id, path_id AS "pathId", student_id AS "studentId", milestone_id AS "milestoneId", type,
                capability_code AS "capabilityCode", priority, reason, status, created_at AS "createdAt", completed_at AS "completedAt"
         FROM path_actions WHERE path_id = $1 AND status = $2 ORDER BY priority, created_at`,
        [pathId, status]
      )
    : await c.query(
        `SELECT id, path_id AS "pathId", student_id AS "studentId", milestone_id AS "milestoneId", type,
                capability_code AS "capabilityCode", priority, reason, status, created_at AS "createdAt", completed_at AS "completedAt"
         FROM path_actions WHERE path_id = $1 ORDER BY priority, created_at`,
        [pathId]
      );
  return rows;
}

export async function getActionById(c: PoolClient, actionId: string): Promise<PathAction | null> {
  const { rows } = await c.query(
    `SELECT id, path_id AS "pathId", student_id AS "studentId", milestone_id AS "milestoneId", type,
            capability_code AS "capabilityCode", priority, reason, status, created_at AS "createdAt", completed_at AS "completedAt"
     FROM path_actions WHERE id = $1`,
    [actionId]
  );
  return rows[0] ?? null;
}

export async function skipAction(c: PoolClient, actionId: string): Promise<PathAction | null> {
  const { rows } = await c.query(
    `UPDATE path_actions SET status = 'SKIPPED' WHERE id = $1 AND status IN ('PENDING','ACTIVE')
     RETURNING id, path_id AS "pathId", student_id AS "studentId", milestone_id AS "milestoneId", type,
               capability_code AS "capabilityCode", priority, reason, status, created_at AS "createdAt", completed_at AS "completedAt"`,
    [actionId]
  );
  return rows[0] ?? null;
}

/** Section 34: milestones the student has explicitly chosen not to pursue right now, so next-best-action generation doesn't immediately re-suggest the same skipped step. */
export async function getSkippedMilestoneIds(c: PoolClient, pathId: string): Promise<Set<string>> {
  const { rows } = await c.query(
    `SELECT DISTINCT milestone_id AS "milestoneId" FROM path_actions WHERE path_id = $1 AND status = 'SKIPPED' AND milestone_id IS NOT NULL`,
    [pathId]
  );
  return new Set(rows.map((r) => r.milestoneId));
}

export async function insertAction(c: PoolClient, tenantId: string, a: Omit<PathAction, "id" | "createdAt" | "completedAt">): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO path_actions (tenant_id, path_id, student_id, milestone_id, type, capability_code, priority, reason, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [tenantId, a.pathId, a.studentId, a.milestoneId, a.type, a.capabilityCode, a.priority, a.reason, a.status]
  );
  return rows[0].id;
}

export async function completeAction(c: PoolClient, actionId: string): Promise<PathAction | null> {
  const { rows } = await c.query(
    `UPDATE path_actions SET status = 'COMPLETED', completed_at = now() WHERE id = $1
     RETURNING id, path_id AS "pathId", student_id AS "studentId", milestone_id AS "milestoneId", type,
               capability_code AS "capabilityCode", priority, reason, status, created_at AS "createdAt", completed_at AS "completedAt"`,
    [actionId]
  );
  return rows[0] ?? null;
}

export async function clearPendingActions(c: PoolClient, pathId: string): Promise<void> {
  // Recalculation supersedes stale suggestions -- distinct from a student's
  // explicit SKIPPED choice (skipAction below), which getSkippedMilestoneIds
  // relies on staying separate so an auto-superseded action doesn't
  // permanently look like a student opt-out.
  await c.query(`UPDATE path_actions SET status = 'SUPERSEDED' WHERE path_id = $1 AND status IN ('PENDING','ACTIVE')`, [pathId]);
}

export async function insertRisk(c: PoolClient, tenantId: string, r: Omit<PathRisk, "id" | "detectedAt" | "resolvedAt">): Promise<void> {
  await c.query(
    `INSERT INTO path_risks (tenant_id, path_id, type, reason, evidence, severity, recommended_response)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, r.pathId, r.type, r.reason, JSON.stringify(r.evidence), r.severity, r.recommendedResponse]
  );
}

export async function getActiveRisks(c: PoolClient, pathId: string): Promise<PathRisk[]> {
  const { rows } = await c.query(
    `SELECT id, path_id AS "pathId", type, reason, evidence, severity, recommended_response AS "recommendedResponse",
            detected_at AS "detectedAt", resolved_at AS "resolvedAt"
     FROM path_risks WHERE path_id = $1 AND resolved_at IS NULL ORDER BY severity DESC, detected_at DESC`,
    [pathId]
  );
  return rows;
}

export async function resolveRisksNotIn(c: PoolClient, pathId: string, activeTypes: string[]): Promise<void> {
  await c.query(
    `UPDATE path_risks SET resolved_at = now() WHERE path_id = $1 AND resolved_at IS NULL AND NOT (type = ANY($2))`,
    [pathId, activeTypes]
  );
}

export async function insertSnapshot(c: PoolClient, tenantId: string, s: Omit<PathSnapshot, "id" | "takenAt">): Promise<void> {
  await c.query(
    `INSERT INTO path_snapshots (tenant_id, path_id, stage_key, readiness, bottleneck_capability) VALUES ($1,$2,$3,$4,$5)`,
    [tenantId, s.pathId, s.stageKey, s.readiness, s.bottleneckCapability]
  );
}

export async function getSnapshots(c: PoolClient, pathId: string): Promise<PathSnapshot[]> {
  const { rows } = await c.query(
    `SELECT id, path_id AS "pathId", stage_key AS "stageKey", readiness, bottleneck_capability AS "bottleneckCapability", taken_at AS "takenAt"
     FROM path_snapshots WHERE path_id = $1 ORDER BY taken_at`,
    [pathId]
  );
  return rows.map((r) => ({ ...r, readiness: Number(r.readiness) }));
}

export async function insertPathEvent(
  c: PoolClient,
  tenantId: string,
  pathId: string,
  eventType: string,
  payload: Record<string, unknown>,
  reason?: string | null,
  summary?: string | null
): Promise<void> {
  await c.query(
    `INSERT INTO path_events (tenant_id, path_id, event_type, payload, reason, summary) VALUES ($1,$2,$3,$4,$5,$6)`,
    [tenantId, pathId, eventType, JSON.stringify(payload), reason ?? null, summary ?? null]
  );
}

export async function getLastChangeEvent(c: PoolClient, pathId: string) {
  const { rows } = await c.query(
    `SELECT event_type AS "eventType", reason, summary, payload, created_at AS "createdAt"
     FROM path_events WHERE path_id = $1 AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [pathId]
  );
  return rows[0] ?? null;
}
