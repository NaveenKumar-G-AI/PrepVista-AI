// =============================================================================
// Shared types for the AI Gateway.
//
// This file is intentionally the one place capability names, task names,
// statuses, and error categories are enumerated. Nothing downstream should
// redeclare its own copy of these — that's how systems like this drift.
// =============================================================================

/** Capabilities a model may support. Only advertise what a model actually has. */
export enum ModelCapability {
  GENERAL = 'GENERAL',
  FAST = 'FAST',
  REASONING = 'REASONING',
  CODING = 'CODING',
  LONG_CONTEXT = 'LONG_CONTEXT',
  EMBEDDING = 'EMBEDDING',
  STRUCTURED_OUTPUT = 'STRUCTURED_OUTPUT',
  STREAMING = 'STREAMING',
}

export enum ModelStatus {
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
  DISABLED = 'DISABLED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum ProviderHealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNAVAILABLE = 'UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  DISABLED = 'DISABLED',
}

/**
 * Task classification. CodeForge's real domain features should map onto
 * these (or extend the list) rather than everything collapsing into
 * GENERIC — see routing/ModelRouter for why this matters for policy
 * decisions and cost attribution.
 */
export enum TaskType {
  INTERVIEW_ANALYSIS = 'INTERVIEW_ANALYSIS',
  CODE_ANALYSIS = 'CODE_ANALYSIS',
  TECHNICAL_COACHING = 'TECHNICAL_COACHING',
  REPORT_GENERATION = 'REPORT_GENERATION',
  RECOMMENDATION = 'RECOMMENDATION',
  CLASSIFICATION = 'CLASSIFICATION',
  EMBEDDING = 'EMBEDDING',
  BACKGROUND_PROCESSING = 'BACKGROUND_PROCESSING',
  GENERIC = 'GENERIC',
}

export enum Priority {
  INTERACTIVE = 'INTERACTIVE',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  BACKGROUND = 'BACKGROUND',
  BULK = 'BULK',
}

/** Normalized error taxonomy. Every provider error must map to one of these. */
export enum ErrorCategory {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTHENTICATION = 'AUTHENTICATION',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTENT_VALIDATION = 'CONTENT_VALIDATION',
  POLICY_REJECTION = 'POLICY_REJECTION',
  BUDGET_LIMIT = 'BUDGET_LIMIT',
  QUOTA_LIMIT = 'QUOTA_LIMIT',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  UNKNOWN = 'UNKNOWN',
}

/** Only these categories are ever retried. See reliability/RetryEngine. */
export const RETRYABLE_ERROR_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  ErrorCategory.TIMEOUT,
  ErrorCategory.NETWORK_ERROR,
  ErrorCategory.PROVIDER_ERROR,
  ErrorCategory.RATE_LIMIT,
]);

export enum CostBasis {
  ACTUAL = 'ACTUAL',
  ESTIMATED = 'ESTIMATED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum RequestStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  FALLBACK = 'FALLBACK',
  CACHED = 'CACHED',
  BLOCKED = 'BLOCKED',
  DEGRADED = 'DEGRADED',
}

/** How broadly a cached response may be reused. Governs cache key construction. */
export enum CacheScope {
  /** Never cache this task's output (default for anything unclassified). */
  NONE = 'NONE',
  /** Safe to reuse for the same user only. */
  USER = 'USER',
  /** Safe to reuse across a tenant, but not across tenants. */
  TENANT = 'TENANT',
  /** Contains no private/user-specific data; safe to reuse platform-wide. */
  GLOBAL = 'GLOBAL',
}

export enum Role {
  STUDENT = 'STUDENT',
  TRAINER = 'TRAINER',
  TPO = 'TPO',
  ORG_ADMIN = 'ORG_ADMIN',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  ENGINEERING_OPERATOR = 'ENGINEERING_OPERATOR',
}

/** Roles permitted to view operational/telemetry data across a tenant. */
export const DASHBOARD_ROLES: ReadonlySet<Role> = new Set([
  Role.ORG_ADMIN,
  Role.PLATFORM_ADMIN,
  Role.ENGINEERING_OPERATOR,
]);

/** Roles permitted to mutate policy/budget/emergency configuration. */
export const CONFIG_WRITE_ROLES: ReadonlySet<Role> = new Set([
  Role.PLATFORM_ADMIN,
  Role.ENGINEERING_OPERATOR,
]);

/** Roles permitted to trip emergency controls / the global kill switch. */
export const EMERGENCY_ROLES: ReadonlySet<Role> = new Set([
  Role.PLATFORM_ADMIN,
  Role.ENGINEERING_OPERATOR,
]);

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: Role;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  inputPricePerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPricePerMTok: number;
  /** Bumped whenever pricing changes, so historical cost records stay interpretable. */
  pricingVersion: number;
  /** ISO date the price was last verified against the provider's official pricing page. */
  pricingAsOf: string;
  /** Where this number came from — required, so nobody has to trust an invented figure. */
  pricingSource: string;
}

export interface ModelDescriptor {
  id: string;
  provider: string;
  modelKey: string;
  family: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens: number;
  status: ModelStatus;
  pricing: ModelPricing;
  /** Populated from observed telemetry once the model has served real traffic. */
  observedAvgLatencyMs?: number;
}

export interface ProviderMetadata {
  name: string;
  capabilities: ModelCapability[];
  supportsStreaming: boolean;
  requiresApiKey: boolean;
  hasApiKeyConfigured: boolean;
}

export interface ProviderHealth {
  provider: string;
  status: ProviderHealthStatus;
  checkedAt: string;
  detail?: string;
}

export interface AIRequestContext {
  requestId: string;
  organizationId: string;
  userId?: string;
  feature: string;
  task: TaskType;
  priority: Priority;
  requiredCapabilities: ModelCapability[];
  qualityRequirement?: 'STANDARD' | 'HIGH';
  maxCostUsd?: number;
  maxLatencyMs?: number;
  idempotencyKey?: string;
  /** Raw conversational/task input. Shaped like Anthropic-style messages for adapter simplicity. */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxOutputTokens?: number;
  /** Task-classification hint used for cache scoping; see cache/CacheLayer. */
  cacheScope?: CacheScope;
}

export enum RoutingReason {
  PREFERRED_MODEL = 'PREFERRED_MODEL',
  CAPABILITY_MATCH = 'CAPABILITY_MATCH',
  COST_CONSTRAINT = 'COST_CONSTRAINT',
  LATENCY_REQUIREMENT = 'LATENCY_REQUIREMENT',
  FALLBACK = 'FALLBACK',
  PROVIDER_HEALTH = 'PROVIDER_HEALTH',
  EXPERIMENT_ASSIGNMENT = 'EXPERIMENT_ASSIGNMENT',
  NO_ELIGIBLE_MODEL = 'NO_ELIGIBLE_MODEL',
}

export interface RoutingDecision {
  model: ModelDescriptor | null;
  reasons: RoutingReason[];
  candidatesConsidered: string[];
  fallbackChain: string[];
}
