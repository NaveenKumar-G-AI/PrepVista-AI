import pg from "pg";
import type {
  DebugAction,
  DebuggingResult,
  DebuggingSession,
  Experiment,
  FailureFingerprint,
  Hypothesis,
  OverfittingSignal,
  RegressionVerification,
  RootCauseChain
} from "../types.js";
import type { DebuggingRepository } from "./repository.js";
import { NotFoundError } from "./repository.js";

const { Pool } = pg;

/**
 * Implements DebuggingRepository against the real Postgres schema in
 * db/schema.sql. Every query here was exercised against a live local
 * Postgres instance while this module was built (see
 * tests/repository.pg.test.ts, which runs automatically whenever
 * DATABASE_URL is set and is skipped otherwise).
 */
export class PgDebuggingRepository implements DebuggingRepository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createSession(session: DebuggingSession): Promise<DebuggingSession> {
    const { rows } = await this.pool.query(
      `insert into debugging_sessions (id, user_id, challenge_id, submission_id, language, state, current_code, started_at, ended_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [
        session.id,
        session.userId,
        session.challengeId,
        session.submissionId,
        session.language,
        session.state,
        session.currentCode,
        session.startedAt,
        session.endedAt
      ]
    );
    return rowToSession(rows[0]);
  }

  async getSession(id: string): Promise<DebuggingSession | null> {
    const { rows } = await this.pool.query(`select * from debugging_sessions where id = $1`, [id]);
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async updateSession(session: DebuggingSession): Promise<DebuggingSession> {
    const { rows } = await this.pool.query(`update debugging_sessions set state=$2, current_code=$3, ended_at=$4 where id=$1 returning *`, [
      session.id,
      session.state,
      session.currentCode,
      session.endedAt
    ]);
    if (!rows[0]) throw new NotFoundError("DebuggingSession", session.id);
    return rowToSession(rows[0]);
  }

  async listSessionsForUser(userId: string): Promise<DebuggingSession[]> {
    const { rows } = await this.pool.query(`select * from debugging_sessions where user_id=$1 order by started_at desc`, [userId]);
    return rows.map(rowToSession);
  }

  async saveFingerprint(fp: FailureFingerprint): Promise<FailureFingerprint> {
    const { rows } = await this.pool.query(
      `insert into debugging_fingerprints
         (id, session_id, failure_type, input, expected_output, actual_output, error_message, stack_trace, source_location, runtime, execution_time_ms, memory_usage_kb, reproduction_status, captured_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [
        fp.id,
        fp.sessionId,
        fp.failureType,
        fp.input,
        fp.expectedOutput,
        fp.actualOutput,
        fp.errorMessage,
        fp.stackTrace,
        fp.sourceLocation ? JSON.stringify(fp.sourceLocation) : null,
        fp.runtime,
        fp.executionTimeMs,
        fp.memoryUsageKB,
        fp.reproductionStatus,
        fp.capturedAt
      ]
    );
    return rowToFingerprint(rows[0]);
  }

  async getFingerprintsForSession(sessionId: string): Promise<FailureFingerprint[]> {
    const { rows } = await this.pool.query(`select * from debugging_fingerprints where session_id=$1 order by captured_at asc`, [sessionId]);
    return rows.map(rowToFingerprint);
  }

  async createHypothesis(h: Hypothesis): Promise<Hypothesis> {
    const { rows } = await this.pool.query(
      `insert into debugging_hypotheses (id, session_id, text, suspected_location, suspected_cause, confidence, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [h.id, h.sessionId, h.text, h.suspectedLocation, h.suspectedCause, h.confidence, h.status, h.createdAt, h.updatedAt]
    );
    return rowToHypothesis(rows[0]);
  }

  async updateHypothesis(h: Hypothesis): Promise<Hypothesis> {
    const { rows } = await this.pool.query(`update debugging_hypotheses set status=$2, updated_at=$3 where id=$1 returning *`, [
      h.id,
      h.status,
      h.updatedAt
    ]);
    if (!rows[0]) throw new NotFoundError("Hypothesis", h.id);
    return rowToHypothesis(rows[0]);
  }

  async getHypothesesForSession(sessionId: string): Promise<Hypothesis[]> {
    const { rows } = await this.pool.query(`select * from debugging_hypotheses where session_id=$1 order by created_at asc`, [sessionId]);
    return rows.map(rowToHypothesis);
  }

  async createExperiment(e: Experiment): Promise<Experiment> {
    const { rows } = await this.pool.query(
      `insert into debugging_experiments (id, session_id, hypothesis_id, action, expected_result, actual_result, conclusion, created_at, resolved_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [e.id, e.sessionId, e.hypothesisId, e.action, e.expectedResult, e.actualResult, e.conclusion, e.createdAt, e.resolvedAt]
    );
    return rowToExperiment(rows[0]);
  }

  async updateExperiment(e: Experiment): Promise<Experiment> {
    const { rows } = await this.pool.query(`update debugging_experiments set actual_result=$2, conclusion=$3, resolved_at=$4 where id=$1 returning *`, [
      e.id,
      e.actualResult,
      e.conclusion,
      e.resolvedAt
    ]);
    if (!rows[0]) throw new NotFoundError("Experiment", e.id);
    return rowToExperiment(rows[0]);
  }

  async getExperimentsForSession(sessionId: string): Promise<Experiment[]> {
    const { rows } = await this.pool.query(`select * from debugging_experiments where session_id=$1 order by created_at asc`, [sessionId]);
    return rows.map(rowToExperiment);
  }

  async logAction(a: DebugAction): Promise<DebugAction> {
    const { rows } = await this.pool.query(`insert into debugging_actions (id, session_id, type, metadata, created_at) values ($1,$2,$3,$4,$5) returning *`, [
      a.id,
      a.sessionId,
      a.type,
      JSON.stringify(a.metadata),
      a.createdAt
    ]);
    return rowToAction(rows[0]);
  }

  async getActionsForSession(sessionId: string): Promise<DebugAction[]> {
    const { rows } = await this.pool.query(`select * from debugging_actions where session_id=$1 order by created_at asc`, [sessionId]);
    return rows.map(rowToAction);
  }

  async saveRootCause(sessionId: string, chain: RootCauseChain): Promise<RootCauseChain> {
    const { rows } = await this.pool.query(`update debugging_sessions set root_cause=$2 where id=$1 returning root_cause`, [
      sessionId,
      JSON.stringify(chain)
    ]);
    if (!rows[0]) throw new NotFoundError("DebuggingSession", sessionId);
    return rows[0].root_cause as RootCauseChain;
  }

  async getRootCause(sessionId: string): Promise<RootCauseChain | null> {
    const { rows } = await this.pool.query(`select root_cause from debugging_sessions where id=$1`, [sessionId]);
    return rows[0]?.root_cause ?? null;
  }

  async saveFixVerification(sessionId: string, regression: RegressionVerification, overfitting: OverfittingSignal): Promise<void> {
    await this.pool.query(`update debugging_sessions set last_regression=$2, last_overfitting=$3 where id=$1`, [
      sessionId,
      JSON.stringify(regression),
      JSON.stringify(overfitting)
    ]);
  }

  async getFixVerification(sessionId: string): Promise<{ regression: RegressionVerification | null; overfitting: OverfittingSignal | null }> {
    const { rows } = await this.pool.query(`select last_regression, last_overfitting from debugging_sessions where id=$1`, [sessionId]);
    return { regression: rows[0]?.last_regression ?? null, overfitting: rows[0]?.last_overfitting ?? null };
  }

  async saveResult(r: DebuggingResult): Promise<DebuggingResult> {
    const { rows } = await this.pool.query(
      `insert into debugging_results (session_id, status, dimensions, root_cause, regression, overfitting, report, generated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (session_id) do update set
         status=excluded.status, dimensions=excluded.dimensions, root_cause=excluded.root_cause,
         regression=excluded.regression, overfitting=excluded.overfitting, report=excluded.report, generated_at=excluded.generated_at
       returning *`,
      [
        r.sessionId,
        r.status,
        JSON.stringify(r.dimensions),
        r.rootCause ? JSON.stringify(r.rootCause) : null,
        r.regression ? JSON.stringify(r.regression) : null,
        r.overfitting ? JSON.stringify(r.overfitting) : null,
        JSON.stringify(r.report),
        r.generatedAt
      ]
    );
    return rowToResult(rows[0]);
  }

  async getResult(sessionId: string): Promise<DebuggingResult | null> {
    const { rows } = await this.pool.query(`select * from debugging_results where session_id=$1`, [sessionId]);
    return rows[0] ? rowToResult(rows[0]) : null;
  }
}

// ---------------------------------------------------------------------------
// Row <-> domain-type mapping. pg auto-parses jsonb/timestamptz columns, so
// jsonb fields arrive as plain objects (not strings) and dates as JS Date -
// only ISO conversion is needed, never JSON.parse, on the read side.
// ---------------------------------------------------------------------------

function rowToSession(row: any): DebuggingSession {
  return {
    id: row.id,
    userId: row.user_id,
    challengeId: row.challenge_id,
    submissionId: row.submission_id,
    language: row.language,
    state: row.state,
    currentCode: row.current_code,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null
  };
}

function rowToFingerprint(row: any): FailureFingerprint {
  return {
    id: row.id,
    sessionId: row.session_id,
    failureType: row.failure_type,
    input: row.input,
    expectedOutput: row.expected_output,
    actualOutput: row.actual_output,
    errorMessage: row.error_message,
    stackTrace: row.stack_trace,
    sourceLocation: row.source_location,
    runtime: row.runtime,
    executionTimeMs: row.execution_time_ms,
    memoryUsageKB: row.memory_usage_kb,
    reproductionStatus: row.reproduction_status,
    capturedAt: row.captured_at.toISOString()
  };
}

function rowToHypothesis(row: any): Hypothesis {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    suspectedLocation: row.suspected_location,
    suspectedCause: row.suspected_cause,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function rowToExperiment(row: any): Experiment {
  return {
    id: row.id,
    sessionId: row.session_id,
    hypothesisId: row.hypothesis_id,
    action: row.action,
    expectedResult: row.expected_result,
    actualResult: row.actual_result,
    conclusion: row.conclusion,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null
  };
}

function rowToAction(row: any): DebugAction {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString()
  };
}

function rowToResult(row: any): DebuggingResult {
  return {
    sessionId: row.session_id,
    status: row.status,
    dimensions: row.dimensions,
    rootCause: row.root_cause,
    regression: row.regression,
    overfitting: row.overfitting,
    report: row.report,
    timeline: [], // timeline is recomputed at read time by the API layer, not stored - see skillModel.buildTimeline
    generatedAt: row.generated_at.toISOString()
  };
}
