import type {
  ApplicabilityResult,
  ShortcutSource,
  ShortcutStatus,
  StrategyClassification,
  StrategyType,
  TrustState,
} from './enums';

/** A single machine-checkable condition, e.g. { field: "percentage", op: "eq", value: 25 }. */
export interface ConditionRule {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'not_in' | 'range' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte';
  value?: unknown;
  /** Optional human-readable version shown in the UI alongside the machine rule. */
  label?: string;
}

/** Everything the Applicability Engine (sec. 34) needs to know about the question at hand. */
export interface QuestionContext {
  questionId?: string;
  questionFamilyId?: string;
  skillId?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | string;
  novelty?: 'FAMILIAR' | 'NOVEL' | string;
  answerType?: 'EXACT' | 'APPROXIMATE_OK' | string;
  hasOptions?: boolean;
  /** Domain-specific facts the condition rules key off, e.g. { percentage: 25 }. */
  attributes?: Record<string, unknown>;
}

export interface ValidationDomainVar {
  min: number;
  max: number;
  integer?: boolean;
  exclude?: number[];
}

/** The variable ranges a shortcut's expression is claimed to be valid over. */
export interface ValidationDomain {
  variables: Record<string, ValidationDomainVar>;
}

export interface ShortcutRow {
  shortcut_id: string;
  tenant_id: string;
  owner_student_id: string | null;
  canonical_name: string;
  description: string;
  category: string;
  domain: string;
  skill_id: string | null;
  formula_id: string | null;
  question_family_id: string | null;
  strategy_type: StrategyType;
  classification: StrategyClassification;
  source: ShortcutSource;
  status: ShortcutStatus;
  risk_level: string;
  requires_options: number;
  is_approximation: number;
  acceptable_error: number | null;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface ShortcutVersionRow {
  id: string;
  shortcut_id: string;
  version: number;
  description: string;
  steps: string; // JSON string[]
  conditions: string; // JSON ConditionRule[]
  non_applicability: string; // JSON ConditionRule[]
  when_to_use_text: string;
  when_not_to_use_text: string;
  underlying_reason: string;
  expression: string | null;
  canonical_expression: string | null;
  validation_domain: string | null; // JSON ValidationDomain
  verification_method: string;
  created_at: string;
}

export interface StudentShortcutStateRow {
  id: string;
  tenant_id: string;
  student_id: string;
  shortcut_id: string;
  state: TrustState;
  reliability: number;
  usage_count: number;
  success_count: number;
  avg_time_saved_ratio: number | null;
  transfer_evidence: string; // JSON
  retention_evidence: string; // JSON
  preferred: number;
  pinned: number;
  notes: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShortcutUsageRow {
  id: string;
  tenant_id: string;
  student_id: string;
  shortcut_id: string;
  question_id: string | null;
  question_family_id: string | null;
  applied: number;
  correct: number;
  response_time_ms: number | null;
  baseline_time_ms: number | null;
  difficulty: string | null;
  novelty: string | null;
  mode: string;
  timed: number;
  assisted: number;
  excluded_reason: string | null;
  created_at: string;
}

export interface AuthContext {
  studentId: string;
  tenantId: string;
  role: 'STUDENT' | 'TRAINER' | 'CONTENT_REVIEWER' | 'ADMIN';
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/** Thrown for expected, user-facing failures; the API layer maps this to 4xx. */
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'DOMAIN_ERROR'
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
