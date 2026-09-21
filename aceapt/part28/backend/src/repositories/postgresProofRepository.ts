import type pg from 'pg';
import type { ProofRepository } from './proofRepository.js';
import type {
  VerificationEvidence, VerificationRequirement, VerificationResult, VerificationSession,
  SimulationProfile, ProofSnapshot, SessionResponse,
} from '../domain/types.js';

// Row shapes coming back from Postgres are snake_case and loosely typed by
// the driver (numeric columns arrive as strings, jsonb columns are already
// parsed objects) — these mappers are the one place that boundary is
// crossed, so nothing downstream has to think about it.

function rowToEvidence(r: Record<string, any>): VerificationEvidence {
  return {
    id: r['id'], studentId: r['student_id'], sessionId: r['session_id'], sourceAttemptId: r['source_attempt_id'],
    evidenceType: r['evidence_type'], capability: r['capability'], difficulty: r['difficulty'], novelty: r['novelty'],
    performance: Number(r['performance']), timeTakenMs: r['time_taken_ms'], expectedTimeMs: r['expected_time_ms'],
    isValid: r['is_valid'], quality: r['quality'], createdAt: new Date(r['created_at']).toISOString(),
  };
}

function rowToRequirement(r: Record<string, any>): VerificationRequirement {
  return {
    id: r['id'], targetId: r['target_id'], capability: r['capability'], minPerformance: Number(r['min_performance']),
    minNovelty: r['min_novelty'], minConsistency: Number(r['min_consistency']),
    minTimedPerformance: Number(r['min_timed_performance']), minConfidenceEvidence: Number(r['min_confidence_evidence']),
    weight: Number(r['weight']), isActive: r['is_active'], createdAt: new Date(r['created_at']).toISOString(),
  };
}

function rowToSession(r: Record<string, any>): VerificationSession {
  return {
    id: r['id'], studentId: r['student_id'], targetId: r['target_id'], simulationProfileId: r['simulation_profile_id'],
    mode: r['mode'], status: r['status'], planReason: r['plan_reason'],
    startedAt: new Date(r['started_at']).toISOString(),
    completedAt: r['completed_at'] ? new Date(r['completed_at']).toISOString() : null,
    createdAt: new Date(r['created_at']).toISOString(),
  };
}

function rowToProfile(r: Record<string, any>): SimulationProfile {
  return {
    id: r['id'], mode: r['mode'], questionCount: r['question_count'],
    difficultyDistribution: r['difficulty_distribution'], topicDistribution: r['topic_distribution'],
    timeLimitMs: r['time_limit_ms'], noveltyTarget: r['novelty_target'], targetCapability: r['target_capability'],
    navigationBehavior: r['navigation_behavior'], scoringRules: r['scoring_rules'],
    createdAt: new Date(r['created_at']).toISOString(),
  };
}

function rowToResult(r: Record<string, any>): VerificationResult {
  return {
    id: r['id'], studentId: r['student_id'], sessionId: r['session_id'], targetId: r['target_id'], status: r['status'],
    confidence: r['confidence'], factors: r['factors'], evidenceSummary: r['evidence_summary'],
    failureSignatures: r['failure_signatures'], explanation: r['explanation'],
    createdAt: new Date(r['created_at']).toISOString(),
  };
}

function rowToSnapshot(r: Record<string, any>): ProofSnapshot {
  return {
    id: r['id'], studentId: r['student_id'], targetId: r['target_id'], resultId: r['result_id'], status: r['status'],
    confidence: r['confidence'], verifiedAt: r['verified_at'] ? new Date(r['verified_at']).toISOString() : null,
    agingState: r['aging_state'], createdAt: new Date(r['created_at']).toISOString(),
  };
}

function rowToResponse(r: Record<string, any>): SessionResponse {
  return {
    studentId: r['student_id'], sessionId: r['session_id'], questionIndex: r['question_index'],
    capability: r['capability'], difficulty: r['difficulty'], novelty: r['novelty'], isCorrect: r['is_correct'],
    timeTakenMs: r['time_taken_ms'], expectedTimeMs: r['expected_time_ms'], skipped: r['skipped'],
    changedAnswer: r['changed_answer'], stalled: r['stalled'],
  };
}

/** Anything with node-postgres's `.query()` signature — a Pool for normal
 *  operation, or a checked-out PoolClient while inside withTransaction. */
type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export class PostgresProofRepository implements ProofRepository {
  constructor(private readonly db: Queryable) {}

  async getActiveRequirement(targetId: string, capability: string) {
    const { rows } = await this.db.query('select * from fn_get_active_requirement($1, $2)', [targetId, capability]);
    return rows[0] ? rowToRequirement(rows[0]) : null;
  }

  async getEvidence(studentId: string, capability?: string) {
    const { rows } = await this.db.query('select * from fn_get_evidence($1, $2)', [studentId, capability ?? null]);
    return rows.map(rowToEvidence);
  }

  async saveEvidence(evidence: VerificationEvidence[]) {
    if (!evidence.length) return;
    const studentId = evidence[0]!.studentId;
    await this.db.query('select fn_save_evidence($1, $2::jsonb)', [studentId, JSON.stringify(evidence)]);
  }

  async createSimulationProfile(profile: Omit<SimulationProfile, 'id' | 'createdAt'>) {
    const { rows } = await this.db.query(
      'select * from fn_create_simulation_profile($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        profile.mode, profile.questionCount, JSON.stringify(profile.difficultyDistribution),
        JSON.stringify(profile.topicDistribution), profile.timeLimitMs, profile.noveltyTarget,
        profile.targetCapability, profile.navigationBehavior, JSON.stringify(profile.scoringRules),
      ],
    );
    return rowToProfile(rows[0]);
  }

  async createSession(
    input: Omit<VerificationSession, 'id' | 'createdAt' | 'completedAt' | 'status' | 'startedAt'> & { status?: VerificationSession['status'] },
  ) {
    const { rows } = await this.db.query(
      'select * from fn_create_session($1,$2,$3,$4,$5)',
      [input.studentId, input.targetId, input.simulationProfileId, input.mode, input.planReason],
    );
    return rowToSession(rows[0]);
  }

  async getSession(sessionId: string, studentId: string) {
    const { rows } = await this.db.query('select * from fn_get_session($1, $2)', [studentId, sessionId]);
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async recordResponse(response: SessionResponse) {
    await this.db.query(
      'select fn_record_response($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [
        response.studentId, response.sessionId, response.questionIndex, response.capability, response.difficulty,
        response.novelty, response.isCorrect, response.timeTakenMs, response.expectedTimeMs, response.skipped,
        response.changedAnswer, response.stalled,
      ],
    );
  }

  async getResponses(sessionId: string, studentId: string) {
    const { rows } = await this.db.query('select * from fn_get_responses($1, $2)', [studentId, sessionId]);
    return rows.map(rowToResponse);
  }

  async completeSession(sessionId: string, studentId: string) {
    const { rows } = await this.db.query('select * from fn_complete_session($1, $2)', [studentId, sessionId]);
    const row = rows[0];
    return { session: rowToSession(row), alreadyCompleted: row.already_completed as boolean };
  }

  async saveResult(result: VerificationResult) {
    const { rows } = await this.db.query(
      'select * from fn_save_result($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)',
      [
        result.studentId, result.sessionId, result.targetId, result.status, result.confidence,
        JSON.stringify(result.factors), JSON.stringify(result.evidenceSummary),
        JSON.stringify(result.failureSignatures), result.explanation,
      ],
    );
    return rowToResult(rows[0]);
  }

  async getLatestResult(studentId: string, targetId: string) {
    const { rows } = await this.db.query('select * from fn_get_latest_result($1, $2)', [studentId, targetId]);
    return rows[0] ? rowToResult(rows[0]) : null;
  }

  async saveSnapshot(snapshot: Omit<ProofSnapshot, 'id' | 'createdAt'>) {
    const { rows } = await this.db.query(
      'select * from fn_save_snapshot($1,$2,$3,$4,$5,$6,$7)',
      [
        snapshot.studentId, snapshot.targetId, snapshot.resultId, snapshot.status, snapshot.confidence,
        snapshot.verifiedAt, snapshot.agingState,
      ],
    );
    return rowToSnapshot(rows[0]);
  }

  async getHistory(studentId: string, targetId: string) {
    const { rows } = await this.db.query('select * from fn_get_history($1, $2)', [studentId, targetId]);
    return rows.map(rowToSnapshot);
  }

  async countRecentSessions(studentId: string, sinceHours: number) {
    const { rows } = await this.db.query('select fn_count_recent_sessions($1, $2) as c', [studentId, sinceHours]);
    return Number(rows[0].c);
  }

  async minutesSinceLastSession(studentId: string) {
    const { rows } = await this.db.query('select fn_minutes_since_last_session($1) as m', [studentId]);
    return rows[0].m === null ? null : Number(rows[0].m);
  }

  /** Checks out one connection and wraps `fn` in BEGIN/COMMIT so the row
   *  lock inside fn_complete_session (Section 49) covers the ENTIRE
   *  completion — evidence, result, and snapshot together — not just the
   *  status column. Without this, a concurrent duplicate call could
   *  unblock from the lock after the status flip but before the winner had
   *  saved a result, see nothing yet, and reprocess. Requires a real Pool;
   *  if this repository was itself constructed from a checked-out client
   *  (i.e. this call is nested inside another withTransaction), it just
   *  reuses that same transaction rather than opening a second one. */
  async withTransaction<T>(fn: (repo: ProofRepository) => Promise<T>): Promise<T> {
    if (!('connect' in this.db)) {
      return fn(this);
    }
    const client = await (this.db as pg.Pool).connect();
    try {
      await client.query('BEGIN');
      const txRepo = new PostgresProofRepository(client);
      const result = await fn(txRepo);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
