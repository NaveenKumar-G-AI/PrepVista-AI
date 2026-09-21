import type { Pool } from 'pg';
import type { ID, PriorityWeights } from '../types/domain.js';
import type {
  CareerStrategy,
  StrategyVersion,
  StrategyAction,
  ActionStatus,
  NotNowReason,
  Bottleneck,
  CareerExperiment,
  Recommendation,
  FeedbackValue,
  StrategyReview,
  StrategyStatus,
  NextMoveKind,
  ValueTier,
} from '../types/strategy.js';
import type { StrategyStore } from './types.js';

/**
 * Real Postgres-backed implementation of StrategyStore, written against the
 * schema in db/migrations/001_feature41_schema.sql. Not used by default
 * (FEATURE41_STORE=memory) since no DATABASE_URL is configured in this repo.
 * Once you've run the migration against your real database and set
 * DATABASE_URL + FEATURE41_STORE=postgres, wire this in from src/app.ts.
 *
 * This has NOT been run against a live database in this build — it type-
 * checks and the SQL matches the migration, but treat it as a first draft to
 * verify against your actual Postgres instance before relying on it.
 */
export class PgStrategyStore implements StrategyStore {
  constructor(private pool: Pool) {}

  async getOrCreateStrategy(studentId: ID): Promise<CareerStrategy> {
    const existing = await this.pool.query(
      `SELECT id, student_id, current_version_id, status, created_at, updated_at FROM career_strategy WHERE student_id = $1`,
      [studentId],
    );
    if (existing.rows[0]) return rowToStrategy(existing.rows[0]);

    const inserted = await this.pool.query(
      `INSERT INTO career_strategy (student_id, status) VALUES ($1, 'insufficient_data')
       RETURNING id, student_id, current_version_id, status, created_at, updated_at`,
      [studentId],
    );
    return rowToStrategy(inserted.rows[0]);
  }

  async updateStrategyStatus(strategyId: ID, status: StrategyStatus): Promise<void> {
    await this.pool.query(`UPDATE career_strategy SET status = $2, updated_at = now() WHERE id = $1`, [strategyId, status]);
  }

  async getCurrentVersion(strategyId: ID): Promise<StrategyVersion | null> {
    const res = await this.pool.query(
      `SELECT sv.* FROM strategy_version sv
       JOIN career_strategy cs ON cs.current_version_id = sv.id
       WHERE cs.id = $1`,
      [strategyId],
    );
    return res.rows[0] ? rowToVersion(res.rows[0]) : null;
  }

  async listVersions(strategyId: ID): Promise<StrategyVersion[]> {
    const res = await this.pool.query(`SELECT * FROM strategy_version WHERE strategy_id = $1 ORDER BY version_number ASC`, [strategyId]);
    return res.rows.map(rowToVersion);
  }

  async createVersion(v: {
    strategyId: ID; versionNumber: number; goalId: ID | null; targetRole: string; reason: string; assumptions: string[]; priorities: PriorityWeights;
  }): Promise<StrategyVersion> {
    await this.pool.query(
      `UPDATE strategy_version SET superseded_at = now() WHERE strategy_id = $1 AND superseded_at IS NULL`,
      [v.strategyId],
    );
    const res = await this.pool.query(
      `INSERT INTO strategy_version (strategy_id, version_number, goal_id, reason, assumptions, priorities)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [v.strategyId, v.versionNumber, v.goalId, v.reason, JSON.stringify(v.assumptions), JSON.stringify(v.priorities)],
    );
    const version = rowToVersion({ ...res.rows[0], target_role: v.targetRole });
    await this.pool.query(`UPDATE career_strategy SET current_version_id = $2, updated_at = now() WHERE id = $1`, [v.strategyId, version.id]);
    return version;
  }

  async saveBottleneck(strategyId: ID, b: Bottleneck): Promise<void> {
    await this.pool.query(`UPDATE bottleneck SET status = 'resolved', resolved_at = now() WHERE strategy_id = $1 AND status = 'active'`, [strategyId]);
    await this.pool.query(
      `INSERT INTO bottleneck (strategy_id, category, description, evidence_refs, severity, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [strategyId, b.category, b.description, JSON.stringify(b.evidence), b.severity],
    );
  }

  async getActiveBottleneck(strategyId: ID): Promise<Bottleneck | null> {
    const res = await this.pool.query(
      `SELECT * FROM bottleneck WHERE strategy_id = $1 AND status = 'active' ORDER BY detected_at DESC LIMIT 1`,
      [strategyId],
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      category: row.category,
      description: row.description,
      whyItMatters: '',
      evidence: row.evidence_refs ?? [],
      severity: row.severity,
      whatHappensIfIgnored: '',
      recommendedAction: 'gather_information',
      runnerUps: [],
      detectedAt: row.detected_at,
    };
  }

  async listActions(strategyId: ID): Promise<StrategyAction[]> {
    const res = await this.pool.query(`SELECT * FROM strategy_action WHERE strategy_id = $1 ORDER BY created_at ASC`, [strategyId]);
    return res.rows.map(rowToAction);
  }

  async createAction(a: { strategyId: ID; kind: NextMoveKind; title: string; valueTier: ValueTier; reasoning: string; targetId?: ID }): Promise<StrategyAction> {
    const res = await this.pool.query(
      `INSERT INTO strategy_action (strategy_id, kind, title, status, value_tier, reasoning)
       VALUES ($1, $2, $3, 'suggested', $4, $5) RETURNING *`,
      [a.strategyId, a.kind, a.title, a.valueTier, a.reasoning],
    );
    return rowToAction(res.rows[0]);
  }

  async updateActionStatus(actionId: ID, status: ActionStatus, notNowReason?: NotNowReason): Promise<StrategyAction> {
    const res = await this.pool.query(
      `UPDATE strategy_action
       SET status = $2, not_now_reason = $3, completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END
       WHERE id = $1 RETURNING *`,
      [actionId, status, notNowReason ?? null],
    );
    if (!res.rows[0]) throw new Error(`Unknown action ${actionId}`);
    return rowToAction(res.rows[0]);
  }

  async createExperiment(e: Omit<CareerExperiment, 'id' | 'createdAt'>): Promise<CareerExperiment> {
    const res = await this.pool.query(
      `INSERT INTO career_experiment (strategy_id, hypothesis, action, expected_outcome, measurement, time_window_days, status, started_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [e.strategyId, e.hypothesis, e.action, e.expectedOutcome, e.measurement, e.timeWindowDays, e.status, e.startedAt ?? null, e.endsAt ?? null],
    );
    return rowToExperiment(res.rows[0]);
  }

  async updateExperiment(id: ID, patch: Partial<CareerExperiment>): Promise<CareerExperiment> {
    const res = await this.pool.query(
      `UPDATE career_experiment SET
         status = COALESCE($2, status),
         actual_outcome = COALESCE($3, actual_outcome),
         conclusion = COALESCE($4, conclusion),
         started_at = COALESCE($5, started_at),
         ends_at = COALESCE($6, ends_at)
       WHERE id = $1 RETURNING *`,
      [id, patch.status ?? null, patch.actualOutcome ?? null, patch.conclusion ?? null, patch.startedAt ?? null, patch.endsAt ?? null],
    );
    if (!res.rows[0]) throw new Error(`Unknown experiment ${id}`);
    return rowToExperiment(res.rows[0]);
  }

  async listExperiments(strategyId: ID): Promise<CareerExperiment[]> {
    const res = await this.pool.query(`SELECT * FROM career_experiment WHERE strategy_id = $1 ORDER BY created_at ASC`, [strategyId]);
    return res.rows.map(rowToExperiment);
  }

  async getExperiment(id: ID): Promise<CareerExperiment | null> {
    const res = await this.pool.query(`SELECT * FROM career_experiment WHERE id = $1`, [id]);
    return res.rows[0] ? rowToExperiment(res.rows[0]) : null;
  }

  async saveRecommendation(r: Omit<Recommendation, 'id' | 'createdAt'>): Promise<Recommendation> {
    const res = await this.pool.query(
      `INSERT INTO recommendation (strategy_id, type, summary, reason, confidence, evidence, unknowns, risks, alternatives, requires_confirmation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [r.strategyId, r.type, r.summary, r.reason, r.confidence, JSON.stringify(r.evidence), JSON.stringify(r.unknowns), JSON.stringify(r.risks), JSON.stringify(r.alternatives), r.requiresConfirmation],
    );
    return rowToRecommendation({ ...res.rows[0], conditions: r.conditions, strategy_impact: r.strategyImpact, generated_by_llm: r.generatedByLLM });
  }

  async getRecommendation(id: ID): Promise<Recommendation | null> {
    const res = await this.pool.query(`SELECT * FROM recommendation WHERE id = $1`, [id]);
    return res.rows[0] ? rowToRecommendation(res.rows[0]) : null;
  }

  async saveRecommendationFeedback(recommendationId: ID, feedback: FeedbackValue, notNowReason?: NotNowReason): Promise<void> {
    await this.pool.query(
      `INSERT INTO recommendation_feedback (recommendation_id, feedback, not_now_reason) VALUES ($1, $2, $3)`,
      [recommendationId, feedback, notNowReason ?? null],
    );
  }

  async saveReview(r: Omit<StrategyReview, 'id' | 'createdAt'>): Promise<StrategyReview> {
    const res = await this.pool.query(
      `INSERT INTO strategy_review (strategy_id, period_start, period_end, progress, decisions, actions, outcomes, blockers, new_opportunities, lessons, next_priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [r.strategyId, r.periodStart, r.periodEnd, r.progress, JSON.stringify(r.decisions), JSON.stringify(r.actions), JSON.stringify(r.outcomes), JSON.stringify(r.blockers), JSON.stringify(r.newOpportunities), JSON.stringify(r.lessons), r.nextPriority],
    );
    return rowToReview(res.rows[0]);
  }

  async getLatestReview(strategyId: ID): Promise<StrategyReview | null> {
    const res = await this.pool.query(`SELECT * FROM strategy_review WHERE strategy_id = $1 ORDER BY period_end DESC LIMIT 1`, [strategyId]);
    return res.rows[0] ? rowToReview(res.rows[0]) : null;
  }

  async listReviews(strategyId: ID): Promise<StrategyReview[]> {
    const res = await this.pool.query(`SELECT * FROM strategy_review WHERE strategy_id = $1 ORDER BY period_end ASC`, [strategyId]);
    return res.rows.map(rowToReview);
  }
}

// --- row mappers -------------------------------------------------------------

function rowToStrategy(row: any): CareerStrategy {
  return {
    id: row.id,
    studentId: row.student_id,
    currentVersionId: row.current_version_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToVersion(row: any): StrategyVersion {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    versionNumber: row.version_number,
    goalId: row.goal_id,
    targetRole: row.target_role ?? '',
    reason: row.reason ?? '',
    assumptions: row.assumptions ?? [],
    priorities: row.priorities ?? {},
    createdAt: row.created_at,
    supersededAt: row.superseded_at ?? undefined,
  };
}

function rowToAction(row: any): StrategyAction {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    valueTier: row.value_tier,
    reasoning: row.reasoning ?? '',
    notNowReason: row.not_now_reason ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function rowToExperiment(row: any): CareerExperiment {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    hypothesis: row.hypothesis,
    action: row.action,
    expectedOutcome: row.expected_outcome,
    measurement: row.measurement,
    timeWindowDays: row.time_window_days,
    status: row.status,
    actualOutcome: row.actual_outcome ?? undefined,
    conclusion: row.conclusion ?? undefined,
    startedAt: row.started_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToRecommendation(row: any): Recommendation {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    type: row.type,
    summary: row.summary,
    reason: row.reason,
    confidence: row.confidence,
    evidence: row.evidence ?? [],
    unknowns: row.unknowns ?? [],
    risks: row.risks ?? [],
    alternatives: row.alternatives ?? [],
    conditions: row.conditions ?? [],
    strategyImpact: row.strategy_impact ?? '',
    requiresConfirmation: row.requires_confirmation,
    createdAt: row.created_at,
    generatedByLLM: row.generated_by_llm ?? false,
  };
}

function rowToReview(row: any): StrategyReview {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    progress: row.progress ?? '',
    decisions: row.decisions ?? [],
    actions: row.actions ?? [],
    outcomes: row.outcomes ?? [],
    blockers: row.blockers ?? [],
    newOpportunities: row.new_opportunities ?? [],
    lessons: row.lessons ?? [],
    nextPriority: row.next_priority ?? '',
    createdAt: row.created_at,
  };
}
