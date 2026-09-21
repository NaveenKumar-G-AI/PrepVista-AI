import type { ID, Goal, Skill, Evidence, Opportunity, ApplicationRecord, DecisionRecord, OutcomeRecord, ConstraintRecord } from '../types/domain.js';
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
import type { PriorityWeights } from '../types/domain.js';

/**
 * Read-only adapter onto data that Features 34-40 and core ACEAPT already
 * own. Feature 41 never writes through this interface and never duplicates
 * these tables (spec #59: "reuse existing... only add missing entities").
 * Implement this against your real student/goal/skill/evidence/opportunity/
 * application/decision/outcome/constraint sources.
 */
export interface ContextSourceRepository {
  getGoal(studentId: ID): Promise<Goal | null>;
  getSkills(studentId: ID): Promise<Skill[]>;
  getEvidence(studentId: ID): Promise<Evidence[]>;
  getOpportunities(studentId: ID): Promise<Opportunity[]>;
  getApplications(studentId: ID): Promise<ApplicationRecord[]>;
  getRecentDecisions(studentId: ID, sinceDays: number): Promise<DecisionRecord[]>;
  getRecentOutcomes(studentId: ID, sinceDays: number): Promise<OutcomeRecord[]>;
  getConstraints(studentId: ID): Promise<ConstraintRecord[]>;
}

/**
 * The entities Feature 41 DOES own (spec #59 new-entities list). This is the
 * only store this module writes to.
 */
export interface StrategyStore {
  getOrCreateStrategy(studentId: ID): Promise<CareerStrategy>;
  updateStrategyStatus(strategyId: ID, status: StrategyStatus): Promise<void>;

  getCurrentVersion(strategyId: ID): Promise<StrategyVersion | null>;
  listVersions(strategyId: ID): Promise<StrategyVersion[]>;
  createVersion(v: {
    strategyId: ID;
    versionNumber: number;
    goalId: ID | null;
    targetRole: string;
    reason: string;
    assumptions: string[];
    priorities: PriorityWeights;
  }): Promise<StrategyVersion>;

  saveBottleneck(strategyId: ID, b: Bottleneck): Promise<void>;
  getActiveBottleneck(strategyId: ID): Promise<Bottleneck | null>;

  listActions(strategyId: ID): Promise<StrategyAction[]>;
  createAction(a: {
    strategyId: ID;
    kind: NextMoveKind;
    title: string;
    valueTier: ValueTier;
    reasoning: string;
    targetId?: ID;
  }): Promise<StrategyAction>;
  updateActionStatus(actionId: ID, status: ActionStatus, notNowReason?: NotNowReason): Promise<StrategyAction>;

  createExperiment(e: Omit<CareerExperiment, 'id' | 'createdAt'>): Promise<CareerExperiment>;
  updateExperiment(id: ID, patch: Partial<CareerExperiment>): Promise<CareerExperiment>;
  listExperiments(strategyId: ID): Promise<CareerExperiment[]>;
  getExperiment(id: ID): Promise<CareerExperiment | null>;

  saveRecommendation(r: Omit<Recommendation, 'id' | 'createdAt'>): Promise<Recommendation>;
  getRecommendation(id: ID): Promise<Recommendation | null>;
  saveRecommendationFeedback(recommendationId: ID, feedback: FeedbackValue, notNowReason?: NotNowReason): Promise<void>;

  saveReview(r: Omit<StrategyReview, 'id' | 'createdAt'>): Promise<StrategyReview>;
  getLatestReview(strategyId: ID): Promise<StrategyReview | null>;
  listReviews(strategyId: ID): Promise<StrategyReview[]>;
}
