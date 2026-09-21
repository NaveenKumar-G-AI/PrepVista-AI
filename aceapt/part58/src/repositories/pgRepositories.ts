/**
 * Postgres-backed repositories (raw SQL, parameterized — no ORM). Each class
 * implements the corresponding interface in ./types.ts. Row <-> domain object
 * mapping is explicit and local to this file, so nothing upstream needs to
 * know about snake_case columns.
 */
import { randomUUID } from 'node:crypto';
import { query } from './db';
import type {
  CalibrationRepository,
  DecisionEventRepository,
  DecisionInsightRepository,
  DecisionPolicyRepository,
  ListDecisionEventsOptions,
  ScenarioRepository,
} from './types';
import type {
  CalibrationSnapshot,
  DecisionAggregateStats,
  DecisionEvent,
  DecisionEventInput,
  DecisionInsight,
  DecisionPolicy,
  DecisionQualityProfile,
  NewCalibrationSnapshot,
  NewDecisionInsight,
  NewDecisionPolicy,
  NewTrainingScenario,
  TrainingMode,
  TrainingScenario,
} from '../types';

// ---------------------------------------------------------------------------
// Row shapes (snake_case, as returned by pg) + mappers
// ---------------------------------------------------------------------------

interface DecisionEventRow {
  id: string;
  tenant_id: string;
  student_id: string;
  assessment_id: string;
  assessment_version_id: string | null;
  question_version_id: string;
  attempt_id: string | null;
  context: DecisionEvent['context'];
  action: DecisionEvent['action'];
  uncertainty_state: DecisionEvent['uncertaintyState'];
  confidence_band: DecisionEvent['confidenceBand'];
  confidence_probability: number | null;
  evidence_used: DecisionEvent['evidenceUsed'];
  eliminated_option_ids: string[];
  total_options: number | null;
  question_expected_time_seconds: number | null;
  student_expected_time_seconds: number | null;
  elapsed_time_seconds: number;
  remaining_test_time_seconds: number | null;
  scoring_policy_version_id: string | null;
  initial_option_id: string | null;
  final_option_id: string | null;
  answer_changed: boolean;
  is_correct: boolean | null;
  decision_quality: DecisionQualityProfile | null;
  idempotency_key: string;
  created_at: Date;
  decided_at: Date;
}

function mapDecisionEvent(row: DecisionEventRow): DecisionEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id,
    assessmentId: row.assessment_id,
    assessmentVersionId: row.assessment_version_id,
    questionVersionId: row.question_version_id,
    attemptId: row.attempt_id,
    context: row.context,
    action: row.action,
    uncertaintyState: row.uncertainty_state,
    confidenceBand: row.confidence_band,
    confidenceProbability: row.confidence_probability,
    evidenceUsed: row.evidence_used ?? [],
    eliminatedOptionIds: row.eliminated_option_ids ?? [],
    totalOptions: row.total_options,
    questionExpectedTimeSeconds: row.question_expected_time_seconds,
    studentExpectedTimeSeconds: row.student_expected_time_seconds,
    elapsedTimeSeconds: row.elapsed_time_seconds,
    remainingTestTimeSeconds: row.remaining_test_time_seconds,
    scoringPolicyVersionId: row.scoring_policy_version_id,
    initialOptionId: row.initial_option_id,
    finalOptionId: row.final_option_id,
    answerChanged: row.answer_changed,
    isCorrect: row.is_correct,
    decisionQuality: row.decision_quality,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at.toISOString(),
  };
}

export class PgDecisionEventRepository implements DecisionEventRepository {
  async create(event: DecisionEventInput): Promise<DecisionEvent> {
    const id = randomUUID();
    const insertResult = await query<DecisionEventRow>(
      `INSERT INTO decision_events (
         id, tenant_id, student_id, assessment_id, assessment_version_id,
         question_version_id, attempt_id, context, action, uncertainty_state,
         confidence_band, confidence_probability, evidence_used, eliminated_option_ids,
         total_options, question_expected_time_seconds, student_expected_time_seconds,
         elapsed_time_seconds, remaining_test_time_seconds, scoring_policy_version_id,
         initial_option_id, final_option_id, answer_changed, idempotency_key
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
       )
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        id,
        event.tenantId,
        event.studentId,
        event.assessmentId,
        event.assessmentVersionId ?? null,
        event.questionVersionId,
        event.attemptId ?? null,
        event.context,
        event.action,
        event.uncertaintyState ?? null,
        event.confidenceBand ?? null,
        event.confidenceProbability ?? null,
        JSON.stringify(event.evidenceUsed ?? []),
        JSON.stringify(event.eliminatedOptionIds ?? []),
        event.totalOptions ?? null,
        event.questionExpectedTimeSeconds ?? null,
        event.studentExpectedTimeSeconds ?? null,
        event.elapsedTimeSeconds,
        event.remainingTestTimeSeconds ?? null,
        event.scoringPolicyVersionId ?? null,
        event.initialOptionId ?? null,
        event.finalOptionId ?? null,
        event.answerChanged,
        event.idempotencyKey,
      ]
    );

    if (insertResult.length > 0) return mapDecisionEvent(insertResult[0]);

    // §202 idempotency: a conflicting insert means this exact decision was
    // already recorded — return the existing row instead of erroring or
    // creating a duplicate.
    const existing = await query<DecisionEventRow>(
      `SELECT * FROM decision_events WHERE tenant_id = $1 AND idempotency_key = $2`,
      [event.tenantId, event.idempotencyKey]
    );
    if (existing.length === 0) {
      throw new Error('Decision event insert conflicted but no existing row was found.');
    }
    return mapDecisionEvent(existing[0]);
  }

  async findById(tenantId: string, id: string): Promise<DecisionEvent | null> {
    const rows = await query<DecisionEventRow>(
      `SELECT * FROM decision_events WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return rows[0] ? mapDecisionEvent(rows[0]) : null;
  }

  async listByStudent(
    tenantId: string,
    studentId: string,
    opts: ListDecisionEventsOptions = {}
  ): Promise<DecisionEvent[]> {
    const conditions = ['tenant_id = $1', 'student_id = $2'];
    const params: unknown[] = [tenantId, studentId];

    if (opts.assessmentId) {
      params.push(opts.assessmentId);
      conditions.push(`assessment_id = $${params.length}`);
    }
    if (opts.action) {
      params.push(opts.action);
      conditions.push(`action = $${params.length}`);
    }
    if (opts.since) {
      params.push(opts.since);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (opts.before) {
      params.push(opts.before);
      conditions.push(`created_at < $${params.length}`);
    }

    const limit = Math.min(opts.limit ?? 50, 200);
    params.push(limit);

    const rows = await query<DecisionEventRow>(
      `SELECT * FROM decision_events WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return rows.map(mapDecisionEvent);
  }

  async updateOutcomeAndQuality(
    tenantId: string,
    id: string,
    outcome: { isCorrect: boolean | null },
    quality: DecisionQualityProfile | null
  ): Promise<DecisionEvent | null> {
    const rows = await query<DecisionEventRow>(
      `UPDATE decision_events SET is_correct = $3, decision_quality = $4
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, outcome.isCorrect, quality ? JSON.stringify(quality) : null]
    );
    return rows[0] ? mapDecisionEvent(rows[0]) : null;
  }

  async aggregateForStudent(
    tenantId: string,
    studentId: string,
    opts: { since?: string } = {}
  ): Promise<DecisionAggregateStats & { sampleSize: number }> {
    const baseParams: unknown[] = [tenantId, studentId];
    let sinceClause = '';
    let sinceParamIndex = -1;
    if (opts.since) {
      baseParams.push(opts.since);
      sinceParamIndex = baseParams.length;
      sinceClause = `AND created_at >= $${sinceParamIndex}`;
    }
    const uncertainStatesParamIndex = baseParams.length + 1;
    const finalParams = [...baseParams, ['UNCERTAIN', 'LOW_CONFIDENCE', 'NO_USEFUL_EVIDENCE']];

    const rows = await query<{
      total_uncertain: string;
      blind_guesses: string;
      eliminate_actions: string;
      skips: string;
      switches: string;
      unsupported_switches: string;
      time_overruns: string;
      period_start: Date | null;
      period_end: Date | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE uncertainty_state = ANY($${uncertainStatesParamIndex})) AS total_uncertain,
         COUNT(*) FILTER (WHERE action = 'BLIND_GUESS') AS blind_guesses,
         COUNT(*) FILTER (WHERE action = 'ELIMINATE' AND uncertainty_state = ANY($${uncertainStatesParamIndex})) AS eliminate_actions,
         COUNT(*) FILTER (WHERE action = 'SKIP') AS skips,
         COUNT(*) FILTER (WHERE answer_changed) AS switches,
         COUNT(*) FILTER (
           WHERE answer_changed
           AND NOT (evidence_used @> '[{"type":"NEW_EVIDENCE_FOR_SWITCH"}]'::jsonb)
         ) AS unsupported_switches,
         COUNT(*) FILTER (
           WHERE question_expected_time_seconds IS NOT NULL
           AND elapsed_time_seconds > question_expected_time_seconds * 1.5
         ) AS time_overruns,
         MIN(created_at) AS period_start,
         MAX(created_at) AS period_end
       FROM decision_events
       WHERE tenant_id = $1 AND student_id = $2 ${sinceClause}`,
      finalParams
    );

    const r = rows[0];
    const totalUncertain = Number(r?.total_uncertain ?? 0);
    const switches = Number(r?.switches ?? 0);

    return {
      totalUncertainDecisions: totalUncertain,
      blindGuessRate: totalUncertain > 0 ? Number(r.blind_guesses) / totalUncertain : 0,
      eliminationRate: totalUncertain > 0 ? Number(r.eliminate_actions) / totalUncertain : 0,
      strategicSkipRate: 0, // computed by StrategicSkippingService, which needs per-skip comparable accuracy
      potentiallyUnnecessarySkipRate: 0, // same as above
      timeOverrunRate: totalUncertain > 0 ? Number(r.time_overruns) / totalUncertain : 0,
      unsupportedSwitchRate: switches > 0 ? Number(r.unsupported_switches) / switches : 0,
      periodStart: r?.period_start?.toISOString() ?? new Date().toISOString(),
      periodEnd: r?.period_end?.toISOString() ?? new Date().toISOString(),
      sampleSize: totalUncertain,
    };
  }
}

// ---------------------------------------------------------------------------

interface DecisionPolicyRow {
  id: string;
  tenant_id: string;
  assessment_version_id: string;
  correct_reward: string;
  wrong_penalty: string;
  blank_value: string;
  partial_value: string | null;
  time_limit_seconds: number | null;
  navigation_rules: DecisionPolicy['navigationRules'];
  strategy_assistance: DecisionPolicy['strategyAssistance'];
  source: DecisionPolicy['source'];
  version: number;
  effective_from: Date;
}

function mapPolicy(row: DecisionPolicyRow): DecisionPolicy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    assessmentVersionId: row.assessment_version_id,
    correctReward: Number(row.correct_reward),
    wrongPenalty: Number(row.wrong_penalty),
    blankValue: Number(row.blank_value),
    partialValue: row.partial_value !== null ? Number(row.partial_value) : null,
    timeLimitSeconds: row.time_limit_seconds,
    navigationRules: row.navigation_rules,
    strategyAssistance: row.strategy_assistance,
    source: row.source,
    version: row.version,
    effectiveFrom: row.effective_from.toISOString(),
  };
}

export class PgDecisionPolicyRepository implements DecisionPolicyRepository {
  async upsertVersion(policy: NewDecisionPolicy): Promise<DecisionPolicy> {
    const rows = await query<DecisionPolicyRow>(
      `INSERT INTO decision_policy_versions (
         tenant_id, assessment_version_id, correct_reward, wrong_penalty, blank_value,
         partial_value, time_limit_seconds, navigation_rules, strategy_assistance, source, version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tenant_id, assessment_version_id, version) DO NOTHING
       RETURNING *`,
      [
        policy.tenantId,
        policy.assessmentVersionId,
        policy.correctReward,
        policy.wrongPenalty,
        policy.blankValue,
        policy.partialValue ?? null,
        policy.timeLimitSeconds ?? null,
        JSON.stringify(policy.navigationRules),
        policy.strategyAssistance,
        policy.source,
        policy.version,
      ]
    );
    if (rows.length > 0) return mapPolicy(rows[0]);
    const existing = await this.getVersion(policy.tenantId, policy.assessmentVersionId, policy.version);
    if (!existing) throw new Error('Policy version insert conflicted but no existing row was found.');
    return existing;
  }

  async getLatest(tenantId: string, assessmentVersionId: string): Promise<DecisionPolicy | null> {
    const rows = await query<DecisionPolicyRow>(
      `SELECT * FROM decision_policy_versions
       WHERE tenant_id = $1 AND assessment_version_id = $2
       ORDER BY version DESC LIMIT 1`,
      [tenantId, assessmentVersionId]
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async getVersion(tenantId: string, assessmentVersionId: string, version: number): Promise<DecisionPolicy | null> {
    const rows = await query<DecisionPolicyRow>(
      `SELECT * FROM decision_policy_versions
       WHERE tenant_id = $1 AND assessment_version_id = $2 AND version = $3`,
      [tenantId, assessmentVersionId, version]
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }
}

// ---------------------------------------------------------------------------

interface DecisionInsightRow {
  id: string;
  tenant_id: string;
  student_id: string;
  insight_type: string;
  message: string;
  evidence: Record<string, unknown>;
  confidence: DecisionInsight['confidence'];
  sample_size: number;
  period_start: Date;
  period_end: Date;
  generated_at: Date;
}

function mapInsight(row: DecisionInsightRow): DecisionInsight {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id,
    insightType: row.insight_type,
    message: row.message,
    evidence: row.evidence,
    confidence: row.confidence,
    sampleSize: row.sample_size,
    periodStart: row.period_start.toISOString(),
    periodEnd: row.period_end.toISOString(),
    generatedAt: row.generated_at.toISOString(),
  };
}

export class PgDecisionInsightRepository implements DecisionInsightRepository {
  async create(insight: NewDecisionInsight): Promise<DecisionInsight> {
    const rows = await query<DecisionInsightRow>(
      `INSERT INTO decision_insights (
         tenant_id, student_id, insight_type, message, evidence, confidence,
         sample_size, period_start, period_end
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        insight.tenantId,
        insight.studentId,
        insight.insightType,
        insight.message,
        JSON.stringify(insight.evidence),
        insight.confidence,
        insight.sampleSize,
        insight.periodStart,
        insight.periodEnd,
      ]
    );
    return mapInsight(rows[0]);
  }

  async listForStudent(tenantId: string, studentId: string, opts: { limit?: number } = {}): Promise<DecisionInsight[]> {
    const rows = await query<DecisionInsightRow>(
      `SELECT * FROM decision_insights WHERE tenant_id = $1 AND student_id = $2
       ORDER BY generated_at DESC LIMIT $3`,
      [tenantId, studentId, Math.min(opts.limit ?? 20, 100)]
    );
    return rows.map(mapInsight);
  }
}

// ---------------------------------------------------------------------------

interface CalibrationRow {
  id: string;
  tenant_id: string;
  student_id: string;
  confidence_band: CalibrationSnapshot['confidenceBand'];
  predicted_probability: string | null;
  observed_accuracy: string;
  sample_size: number;
  period_start: Date;
  period_end: Date;
  computed_at: Date;
}

function mapCalibration(row: CalibrationRow): CalibrationSnapshot {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id,
    confidenceBand: row.confidence_band,
    predictedProbability: row.predicted_probability !== null ? Number(row.predicted_probability) : null,
    observedAccuracy: Number(row.observed_accuracy),
    sampleSize: row.sample_size,
    periodStart: row.period_start.toISOString(),
    periodEnd: row.period_end.toISOString(),
    computedAt: row.computed_at.toISOString(),
  };
}

export class PgCalibrationRepository implements CalibrationRepository {
  async upsertSnapshot(snapshot: NewCalibrationSnapshot): Promise<CalibrationSnapshot> {
    const rows = await query<CalibrationRow>(
      `INSERT INTO confidence_calibration_snapshots (
         tenant_id, student_id, confidence_band, predicted_probability, observed_accuracy,
         sample_size, period_start, period_end
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, student_id, confidence_band, period_start, period_end)
       DO UPDATE SET observed_accuracy = EXCLUDED.observed_accuracy, sample_size = EXCLUDED.sample_size,
         predicted_probability = EXCLUDED.predicted_probability, computed_at = now()
       RETURNING *`,
      [
        snapshot.tenantId,
        snapshot.studentId,
        snapshot.confidenceBand,
        snapshot.predictedProbability ?? null,
        snapshot.observedAccuracy,
        snapshot.sampleSize,
        snapshot.periodStart,
        snapshot.periodEnd,
      ]
    );
    return mapCalibration(rows[0]);
  }

  async listForStudent(tenantId: string, studentId: string): Promise<CalibrationSnapshot[]> {
    const rows = await query<CalibrationRow>(
      `SELECT * FROM confidence_calibration_snapshots WHERE tenant_id = $1 AND student_id = $2
       ORDER BY period_end DESC`,
      [tenantId, studentId]
    );
    return rows.map(mapCalibration);
  }
}

// ---------------------------------------------------------------------------

interface ScenarioRow {
  id: string;
  tenant_id: string;
  mode: TrainingMode;
  difficulty_level: number;
  question_version_id: string | null;
  policy_version_id: string | null;
  generated_by: TrainingScenario['generatedBy'];
  validation_status: TrainingScenario['validationStatus'];
  payload: Record<string, unknown>;
  created_at: Date;
}

function mapScenario(row: ScenarioRow): TrainingScenario {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    mode: row.mode,
    difficultyLevel: row.difficulty_level,
    questionVersionId: row.question_version_id,
    policyVersionId: row.policy_version_id,
    generatedBy: row.generated_by,
    validationStatus: row.validation_status,
    payload: row.payload,
    createdAt: row.created_at.toISOString(),
  };
}

export class PgScenarioRepository implements ScenarioRepository {
  async create(scenario: NewTrainingScenario): Promise<TrainingScenario> {
    const rows = await query<ScenarioRow>(
      `INSERT INTO decision_training_scenarios (
         tenant_id, mode, difficulty_level, question_version_id, policy_version_id,
         generated_by, validation_status, payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        scenario.tenantId,
        scenario.mode,
        scenario.difficultyLevel,
        scenario.questionVersionId ?? null,
        scenario.policyVersionId ?? null,
        scenario.generatedBy,
        scenario.validationStatus,
        JSON.stringify(scenario.payload),
      ]
    );
    return mapScenario(rows[0]);
  }

  async findById(tenantId: string, id: string): Promise<TrainingScenario | null> {
    const rows = await query<ScenarioRow>(
      `SELECT * FROM decision_training_scenarios WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return rows[0] ? mapScenario(rows[0]) : null;
  }

  async findServable(tenantId: string, mode: TrainingMode, difficultyLevel: number): Promise<TrainingScenario | null> {
    const rows = await query<ScenarioRow>(
      `SELECT * FROM decision_training_scenarios
       WHERE tenant_id = $1 AND mode = $2 AND difficulty_level = $3 AND validation_status = 'VALIDATED'
       ORDER BY random() LIMIT 1`,
      [tenantId, mode, difficultyLevel]
    );
    return rows[0] ? mapScenario(rows[0]) : null;
  }

  async markValidated(id: string, status: 'VALIDATED' | 'REJECTED'): Promise<void> {
    await query(`UPDATE decision_training_scenarios SET validation_status = $2 WHERE id = $1`, [id, status]);
  }
}
