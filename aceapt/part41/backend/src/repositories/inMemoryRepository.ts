import type { ID, Goal, Skill, Evidence, Opportunity, ApplicationRecord, DecisionRecord, OutcomeRecord, ConstraintRecord, PriorityWeights } from '../types/domain.js';
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
import type { ContextSourceRepository, StrategyStore } from './types.js';

/**
 * Seedable fake standing in for Features 34-40's real data sources. Used as
 * the default so this module is runnable and demonstrable without a real
 * ACEAPT database wired up. Swap for real adapters when integrating —
 * nothing else in this module depends on this being in-memory.
 */
export class InMemoryContextSourceRepository implements ContextSourceRepository {
  private goals = new Map<ID, Goal>();
  private skills = new Map<ID, Skill[]>();
  private evidence = new Map<ID, Evidence[]>();
  private opportunities = new Map<ID, Opportunity[]>();
  private applications = new Map<ID, ApplicationRecord[]>();
  private decisions = new Map<ID, DecisionRecord[]>();
  private outcomes = new Map<ID, OutcomeRecord[]>();
  private constraints = new Map<ID, ConstraintRecord[]>();

  seedStudent(studentId: ID, data: {
    goal?: Goal;
    skills?: Skill[];
    evidence?: Evidence[];
    opportunities?: Opportunity[];
    applications?: ApplicationRecord[];
    decisions?: DecisionRecord[];
    outcomes?: OutcomeRecord[];
    constraints?: ConstraintRecord[];
  }): void {
    if (data.goal) this.goals.set(studentId, data.goal);
    if (data.skills) this.skills.set(studentId, data.skills);
    if (data.evidence) this.evidence.set(studentId, data.evidence);
    if (data.opportunities) this.opportunities.set(studentId, data.opportunities);
    if (data.applications) this.applications.set(studentId, data.applications);
    if (data.decisions) this.decisions.set(studentId, data.decisions);
    if (data.outcomes) this.outcomes.set(studentId, data.outcomes);
    if (data.constraints) this.constraints.set(studentId, data.constraints);
  }

  async getGoal(studentId: ID) { return this.goals.get(studentId) ?? null; }
  async getSkills(studentId: ID) { return this.skills.get(studentId) ?? []; }
  async getEvidence(studentId: ID) { return this.evidence.get(studentId) ?? []; }
  async getOpportunities(studentId: ID) { return this.opportunities.get(studentId) ?? []; }
  async getApplications(studentId: ID) { return this.applications.get(studentId) ?? []; }
  async getRecentDecisions(studentId: ID, sinceDays: number) {
    const cutoff = Date.now() - sinceDays * 86400000;
    return (this.decisions.get(studentId) ?? []).filter((d) => new Date(d.createdAt).getTime() >= cutoff);
  }
  async getRecentOutcomes(studentId: ID, sinceDays: number) {
    const cutoff = Date.now() - sinceDays * 86400000;
    return (this.outcomes.get(studentId) ?? []).filter((o) => new Date(o.recordedAt).getTime() >= cutoff);
  }
  async getConstraints(studentId: ID) { return this.constraints.get(studentId) ?? []; }

  /** Convenience mutator standing in for "however ACEAPT's real decision
   * feature persists a DecisionRecord today". Not part of
   * ContextSourceRepository (which is read-only) — used directly by the
   * demo route as the `persistDecision` callback recordDecision() expects. */
  async addDecision(studentId: ID, input: { question: string; optionsConsidered: string[]; chosenOption: string; impliedTargetRole?: string }): Promise<DecisionRecord> {
    const decision: DecisionRecord = {
      id: crypto.randomUUID(),
      studentId,
      question: input.question,
      optionsConsidered: input.optionsConsidered,
      chosenOption: input.chosenOption,
      impliedTargetRole: input.impliedTargetRole,
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const list = this.decisions.get(studentId) ?? [];
    list.push(decision);
    this.decisions.set(studentId, list);
    return decision;
  }
}

/** Default StrategyStore — this is the store Feature 41 actually owns and
 * writes to. Swap for PgStrategyStore (pgRepository.ts) once DATABASE_URL is
 * set and the migration has been run. */
export class InMemoryStrategyStore implements StrategyStore {
  private strategies = new Map<ID, CareerStrategy>();
  private strategyByStudent = new Map<ID, ID>();
  private versions = new Map<ID, StrategyVersion[]>();
  private bottlenecks = new Map<ID, Bottleneck>();
  private actions = new Map<ID, StrategyAction[]>();
  private experiments = new Map<ID, CareerExperiment>();
  private experimentsByStrategy = new Map<ID, ID[]>();
  private recommendations = new Map<ID, Recommendation>();
  private reviews = new Map<ID, StrategyReview[]>();

  async getOrCreateStrategy(studentId: ID): Promise<CareerStrategy> {
    const existingId = this.strategyByStudent.get(studentId);
    if (existingId) return this.strategies.get(existingId)!;
    const now = new Date().toISOString();
    const strategy: CareerStrategy = { id: crypto.randomUUID(), studentId, currentVersionId: null, status: 'insufficient_data', createdAt: now, updatedAt: now };
    this.strategies.set(strategy.id, strategy);
    this.strategyByStudent.set(studentId, strategy.id);
    return strategy;
  }

  async updateStrategyStatus(strategyId: ID, status: StrategyStatus): Promise<void> {
    const s = this.strategies.get(strategyId);
    if (!s) throw new Error(`Unknown strategy ${strategyId}`);
    s.status = status;
    s.updatedAt = new Date().toISOString();
  }

  async getCurrentVersion(strategyId: ID): Promise<StrategyVersion | null> {
    const s = this.strategies.get(strategyId);
    if (!s?.currentVersionId) return null;
    return (this.versions.get(strategyId) ?? []).find((v) => v.id === s.currentVersionId) ?? null;
  }

  async listVersions(strategyId: ID): Promise<StrategyVersion[]> {
    return [...(this.versions.get(strategyId) ?? [])].sort((a, b) => a.versionNumber - b.versionNumber);
  }

  async createVersion(v: {
    strategyId: ID; versionNumber: number; goalId: ID | null; targetRole: string; reason: string; assumptions: string[]; priorities: PriorityWeights;
  }): Promise<StrategyVersion> {
    const now = new Date().toISOString();
    const list = this.versions.get(v.strategyId) ?? [];
    const previous = list.find((existing) => !existing.supersededAt);
    if (previous) previous.supersededAt = now;
    const version: StrategyVersion = { id: crypto.randomUUID(), createdAt: now, ...v };
    list.push(version);
    this.versions.set(v.strategyId, list);
    const strategy = this.strategies.get(v.strategyId);
    if (strategy) { strategy.currentVersionId = version.id; strategy.updatedAt = now; }
    return version;
  }

  async saveBottleneck(strategyId: ID, b: Bottleneck): Promise<void> {
    this.bottlenecks.set(strategyId, b);
  }
  async getActiveBottleneck(strategyId: ID): Promise<Bottleneck | null> {
    return this.bottlenecks.get(strategyId) ?? null;
  }

  async listActions(strategyId: ID): Promise<StrategyAction[]> {
    return [...(this.actions.get(strategyId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createAction(a: { strategyId: ID; kind: NextMoveKind; title: string; valueTier: ValueTier; reasoning: string; targetId?: ID }): Promise<StrategyAction> {
    const action: StrategyAction = { id: crypto.randomUUID(), status: 'suggested', createdAt: new Date().toISOString(), ...a };
    const list = this.actions.get(a.strategyId) ?? [];
    list.push(action);
    this.actions.set(a.strategyId, list);
    return action;
  }

  async updateActionStatus(actionId: ID, status: ActionStatus, notNowReason?: NotNowReason): Promise<StrategyAction> {
    for (const list of this.actions.values()) {
      const action = list.find((a) => a.id === actionId);
      if (action) {
        action.status = status;
        if (notNowReason) action.notNowReason = notNowReason;
        if (status === 'completed') action.completedAt = new Date().toISOString();
        return action;
      }
    }
    throw new Error(`Unknown action ${actionId}`);
  }

  async createExperiment(e: Omit<CareerExperiment, 'id' | 'createdAt'>): Promise<CareerExperiment> {
    const exp: CareerExperiment = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...e };
    this.experiments.set(exp.id, exp);
    const list = this.experimentsByStrategy.get(e.strategyId) ?? [];
    list.push(exp.id);
    this.experimentsByStrategy.set(e.strategyId, list);
    return exp;
  }
  async updateExperiment(id: ID, patch: Partial<CareerExperiment>): Promise<CareerExperiment> {
    const exp = this.experiments.get(id);
    if (!exp) throw new Error(`Unknown experiment ${id}`);
    Object.assign(exp, patch);
    return exp;
  }
  async listExperiments(strategyId: ID): Promise<CareerExperiment[]> {
    return (this.experimentsByStrategy.get(strategyId) ?? []).map((id) => this.experiments.get(id)!).filter(Boolean);
  }
  async getExperiment(id: ID): Promise<CareerExperiment | null> {
    return this.experiments.get(id) ?? null;
  }

  async saveRecommendation(r: Omit<Recommendation, 'id' | 'createdAt'>): Promise<Recommendation> {
    const rec: Recommendation = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...r };
    this.recommendations.set(rec.id, rec);
    return rec;
  }
  async getRecommendation(id: ID): Promise<Recommendation | null> {
    return this.recommendations.get(id) ?? null;
  }
  async saveRecommendationFeedback(_recommendationId: ID, _feedback: FeedbackValue, _notNowReason?: NotNowReason): Promise<void> {
    // Feedback is currently logged via the event bus (recommendation_feedback)
    // rather than mutating the recommendation itself, so the audit trail
    // (spec #51) stays append-only. Persist to a dedicated table in the
    // Postgres implementation once wired up.
  }

  async saveReview(r: Omit<StrategyReview, 'id' | 'createdAt'>): Promise<StrategyReview> {
    const review: StrategyReview = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...r };
    const list = this.reviews.get(r.strategyId) ?? [];
    list.push(review);
    this.reviews.set(r.strategyId, list);
    return review;
  }
  async getLatestReview(strategyId: ID): Promise<StrategyReview | null> {
    const list = this.reviews.get(strategyId) ?? [];
    return list[list.length - 1] ?? null;
  }
  async listReviews(strategyId: ID): Promise<StrategyReview[]> {
    return [...(this.reviews.get(strategyId) ?? [])];
  }
}
