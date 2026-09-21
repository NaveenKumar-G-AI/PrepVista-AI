import { randomUUID } from "node:crypto";
import pg from "pg";
import type { InterventionRecord, LearningAction, LearningEventRecord, PathVersion, Skill, SkillEvidenceRecord, StudentContext } from "../domain/types.js";
import type { AttemptSignal } from "../domain/stuckDetection.js";
import type { AttemptRecordInput, Store } from "./types.js";

/**
 * Runs `fn` inside a transaction with `app.current_student_id` set via
 * SET LOCAL, so the setting is transaction-scoped and can never leak to a
 * different request that later reuses this pooled connection. This is the
 * one thing this file has to get right for the RLS policies in
 * migrations/001_init.sql to mean anything.
 */
async function withStudentSession<T>(pool: pg.Pool, studentId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_student_id', $1, true)", [studentId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function toDimension(row: any): SkillEvidenceRecord["foundation"] {
  return row ?? { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null };
}

function rowToEvidence(row: any): SkillEvidenceRecord {
  return {
    studentId: row.student_id,
    skillId: row.skill_id,
    foundation: toDimension(row.foundation),
    application: toDimension(row.application),
    transferFamiliar: toDimension(row.transfer_familiar),
    transferVariant: toDimension(row.transfer_variant),
    recentDifficulty: row.recent_difficulty,
    recentErrorSignatures: row.recent_error_signatures ?? [],
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
  };
}

function rowToAction(row: any): LearningAction {
  return {
    id: row.id,
    studentId: row.student_id,
    skillId: row.skill_id,
    actionType: row.action_type,
    reason: row.reason,
    priority: Number(row.priority),
    estimatedDuration: row.estimated_duration,
    targetCapability: row.target_capability,
    difficulty: row.difficulty,
    evidenceBasis: row.evidence_basis ?? [],
    status: row.status,
    interventionType: row.intervention_type,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    resultingEvidenceSummary: row.resulting_evidence_summary,
  };
}

export class PostgresStore implements Store {
  constructor(private pool: pg.Pool) {}

  static fromConnectionString(connectionString: string): PostgresStore {
    return new PostgresStore(new pg.Pool({ connectionString }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getSkillCatalog(): Promise<Skill[]> {
    const skillsRes = await this.pool.query("SELECT id, name, category, base_relevance, estimated_learn_minutes FROM skills");
    const prereqRes = await this.pool.query("SELECT skill_id, prerequisite_id FROM skill_prerequisites");
    const prereqMap = new Map<string, string[]>();
    for (const row of prereqRes.rows) {
      if (!prereqMap.has(row.skill_id)) prereqMap.set(row.skill_id, []);
      prereqMap.get(row.skill_id)!.push(row.prerequisite_id);
    }
    return skillsRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      prerequisiteIds: prereqMap.get(r.id) ?? [],
      baseRelevance: r.base_relevance ?? {},
      estimatedLearnMinutes: r.estimated_learn_minutes,
    }));
  }

  async getStudent(studentId: string): Promise<StudentContext | null> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = await client.query("SELECT * FROM students WHERE id = $1", [studentId]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        studentId: r.id,
        goal: r.goal,
        availableMinutesPerSession: r.available_minutes,
        deadline: r.deadline ? new Date(r.deadline).toISOString() : null,
        targetSkillIds: r.target_skill_ids ?? [],
      };
    });
  }

  // Student upsert is deliberately NOT behind a SECURITY DEFINER function:
  // in the real system this table belongs to Feature 1, and this codepath
  // exists only so the seed script / demo can stand up fixture students.
  // It runs with the migration (superuser) connection, never the app role.
  async upsertStudent(context: StudentContext, name: string): Promise<void> {
    throw new Error("upsertStudent must be called via scripts/seed.ts using the migration connection, not the app Store — see comment above.");
  }

  async getEvidenceForStudent(studentId: string): Promise<Map<string, SkillEvidenceRecord>> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = await client.query("SELECT * FROM skill_evidence WHERE student_id = $1", [studentId]);
      const map = new Map<string, SkillEvidenceRecord>();
      for (const row of res.rows) map.set(row.skill_id, rowToEvidence(row));
      return map;
    });
  }

  async upsertEvidence(evidence: SkillEvidenceRecord): Promise<void> {
    await withStudentSession(this.pool, evidence.studentId, (client) =>
      client.query(
        `SELECT fn_upsert_skill_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          evidence.studentId,
          evidence.skillId,
          JSON.stringify(evidence.foundation),
          JSON.stringify(evidence.application),
          JSON.stringify(evidence.transferFamiliar),
          JSON.stringify(evidence.transferVariant),
          evidence.recentDifficulty,
          JSON.stringify(evidence.recentErrorSignatures),
          evidence.verifiedAt,
        ]
      )
    );
  }

  async recordAttempt(studentId: string, input: AttemptRecordInput): Promise<void> {
    await withStudentSession(this.pool, studentId, (client) =>
      client.query(
        `INSERT INTO learning_attempts (student_id, skill_id, correct, hint_used, error_signature, time_ms, expected_time_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [studentId, input.skillId, input.correct, input.hintUsed, input.errorSignature, input.timeMs, input.expectedTimeMs]
      )
    );
  }

  async getRecentAttemptsBySkill(studentId: string, limit = 20): Promise<Map<string, AttemptSignal[]>> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = await client.query(
        `SELECT * FROM (
           SELECT *, row_number() OVER (PARTITION BY skill_id ORDER BY created_at DESC) AS rn
           FROM learning_attempts WHERE student_id = $1
         ) t WHERE rn <= $2 ORDER BY skill_id, created_at ASC`,
        [studentId, limit]
      );
      const map = new Map<string, AttemptSignal[]>();
      for (const row of res.rows) {
        if (!map.has(row.skill_id)) map.set(row.skill_id, []);
        map.get(row.skill_id)!.push({
          correct: row.correct,
          hintUsed: row.hint_used,
          errorSignature: row.error_signature,
          timeMs: row.time_ms,
          expectedTimeMs: row.expected_time_ms,
          createdAt: new Date(row.created_at).toISOString(),
        });
      }
      return map;
    });
  }

  async getLatestPathVersion(studentId: string): Promise<PathVersion | null> {
    const versions = await this.listPathVersions(studentId);
    return versions.length ? versions[versions.length - 1] : null;
  }

  async listPathVersions(studentId: string): Promise<PathVersion[]> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const versionsRes = await client.query("SELECT * FROM learning_path_versions WHERE student_id = $1 ORDER BY version_number ASC", [studentId]);
      const versions: PathVersion[] = [];
      for (const v of versionsRes.rows) {
        const nodesRes = await client.query("SELECT * FROM learning_path_nodes WHERE version_id = $1 ORDER BY node_order ASC", [v.id]);
        versions.push({
          id: v.id,
          studentId: v.student_id,
          versionNumber: v.version_number,
          reason: v.reason,
          triggeringEvidence: v.triggering_evidence ?? [],
          tradeoffMessage: v.tradeoff_message,
          createdAt: new Date(v.created_at).toISOString(),
          nodes: nodesRes.rows.map((n) => ({
            skillId: n.skill_id,
            skillName: n.skill_id, // resolved by caller against the catalog if a display name is needed
            order: n.node_order,
            status: n.status,
            priorityScore: Number(n.priority_score),
            reason: n.reason,
            estimatedMinutes: n.estimated_minutes,
            action: n.action,
          })),
        });
      }
      return versions;
    });
  }

  async savePathVersion(version: PathVersion): Promise<PathVersion> {
    const pathId = `path_${version.studentId}`;
    return withStudentSession(this.pool, version.studentId, async (client) => {
      const res = await client.query(`SELECT * FROM fn_save_path_version($1,$2,$3,$4,$5,$6,$7)`, [
        version.studentId,
        pathId,
        version.id,
        version.reason,
        JSON.stringify(version.triggeringEvidence),
        version.tradeoffMessage,
        JSON.stringify(version.nodes),
      ]);
      const row = res.rows[0];
      return { ...version, id: row.out_version_id, versionNumber: row.out_version_number };
    });
  }

  async createAction(action: LearningAction): Promise<LearningAction> {
    return withStudentSession(this.pool, action.studentId, async (client) => {
      const res = await client.query(`SELECT * FROM fn_create_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
        action.studentId,
        action.id,
        action.skillId,
        action.actionType,
        action.reason,
        action.priority,
        action.estimatedDuration,
        action.targetCapability,
        action.difficulty,
        JSON.stringify(action.evidenceBasis),
        action.interventionType,
      ]);
      return rowToAction(res.rows[0]);
    });
  }

  async getAction(studentId: string, actionId: string): Promise<LearningAction | null> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = await client.query("SELECT * FROM learning_actions WHERE id = $1 AND student_id = $2", [actionId, studentId]);
      return res.rows.length ? rowToAction(res.rows[0]) : null;
    });
  }

  async listActions(studentId: string, status?: LearningAction["status"]): Promise<LearningAction[]> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = status
        ? await client.query("SELECT * FROM learning_actions WHERE student_id = $1 AND status = $2 ORDER BY created_at DESC", [studentId, status])
        : await client.query("SELECT * FROM learning_actions WHERE student_id = $1 ORDER BY created_at DESC", [studentId]);
      return res.rows.map(rowToAction);
    });
  }

  async transitionAction(studentId: string, actionId: string, newStatus: LearningAction["status"]): Promise<LearningAction> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = await client.query(`SELECT * FROM fn_transition_action($1,$2,$3)`, [studentId, actionId, newStatus]);
      return rowToAction(res.rows[0]);
    });
  }

  async getInterventionsBySkill(studentId: string): Promise<Map<string, InterventionRecord[]>> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = await client.query("SELECT * FROM interventions WHERE student_id = $1 ORDER BY created_at ASC", [studentId]);
      const map = new Map<string, InterventionRecord[]>();
      for (const row of res.rows) {
        if (!map.has(row.skill_id)) map.set(row.skill_id, []);
        map.get(row.skill_id)!.push({
          id: row.id,
          studentId: row.student_id,
          skillId: row.skill_id,
          type: row.type,
          reason: row.reason,
          sequenceIndex: row.sequence_index,
          createdAt: new Date(row.created_at).toISOString(),
          outcomeImproved: row.outcome_improved,
        });
      }
      return map;
    });
  }

  async recordIntervention(record: InterventionRecord): Promise<void> {
    await withStudentSession(this.pool, record.studentId, (client) =>
      client.query(`SELECT fn_record_intervention($1,$2,$3,$4,$5,$6)`, [record.studentId, record.id, record.skillId, record.type, record.reason, record.sequenceIndex])
    );
  }

  async appendEvent(event: LearningEventRecord): Promise<void> {
    await withStudentSession(this.pool, event.studentId, (client) =>
      client.query(`INSERT INTO learning_events (id, student_id, type, skill_id, action_id, payload) VALUES ($1,$2,$3,$4,$5,$6)`, [
        event.id,
        event.studentId,
        event.type,
        event.skillId,
        event.actionId,
        event.payload ? JSON.stringify(event.payload) : null,
      ])
    );
  }

  async getEvents(studentId: string, limit = 100): Promise<LearningEventRecord[]> {
    return withStudentSession(this.pool, studentId, async (client) => {
      const res = await client.query("SELECT * FROM learning_events WHERE student_id = $1 ORDER BY created_at DESC LIMIT $2", [studentId, limit]);
      return res.rows.map((row) => ({
        id: row.id,
        studentId: row.student_id,
        type: row.type,
        skillId: row.skill_id,
        actionId: row.action_id,
        payload: row.payload,
        createdAt: new Date(row.created_at).toISOString(),
      }));
    });
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
