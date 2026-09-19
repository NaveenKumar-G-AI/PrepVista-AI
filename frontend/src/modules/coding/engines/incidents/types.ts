// ============================================================
// Core domain types for the incident simulation engine.
// This module has zero framework/DB dependencies on purpose:
// it is pure, deterministic TypeScript so it can be unit tested
// in isolation and reused from API routes, scripts, or tests.
// ============================================================

export const INCIDENT_STATES = [
  "CREATED",
  "ACTIVE",
  "INVESTIGATING",
  "MITIGATED",
  "FIXING",
  "VERIFYING",
  "RESOLVED",
  "POSTMORTEM",
  "EVALUATED",
] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

export const ACTION_TYPES = [
  "INSPECT_LOGS",
  "INSPECT_METRICS",
  "INSPECT_TRACES",
  "INSPECT_DEPLOYMENT",
  "RUN_DIAGNOSTIC",
  "RESTART_SERVICE",
  "ROLLBACK",
  "DISABLE_FEATURE",
  "SCALE_SERVICE",
  "CHANGE_CONFIGURATION",
  "DEPLOY_FIX",
  "RUN_TESTS",
  "VERIFY_SERVICE",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type ActionRisk = "SAFE" | "CAUTION" | "DANGEROUS";
export type ActionValidity = "OPTIMAL" | "ACCEPTABLE" | "RISKY" | "INVALID";

export type HypothesisCategory =
  | "SYMPTOM"
  | "IMMEDIATE_CAUSE"
  | "ROOT_CAUSE"
  | "CONTRIBUTING_FACTOR";

export type ServiceKind =
  | "frontend"
  | "gateway"
  | "service"
  | "database"
  | "cache"
  | "queue"
  | "worker"
  | "external";

export type ServiceHealth = "HEALTHY" | "DEGRADED" | "FAILING" | "UNKNOWN";

export interface ServiceNode {
  key: string;
  name: string;
  kind: ServiceKind;
  dependsOn: string[];
}

export interface TimelineEvent {
  offsetMinutes: number;
  label: string;
  detail?: string;
  eventKind: string;
}

export interface DeploymentRecord {
  id: string;
  serviceKey: string;
  version: string;
  offsetMinutes: number;
  changeSummary: string;
  status: string;
  commitRef?: string;
}

export interface AlertRecord {
  id: string;
  alertType: string;
  severity: string;
  offsetMinutes: number;
  serviceKey?: string;
  message: string;
  triggerCondition: "ALWAYS" | "IF_ESCALATED";
}

export interface LogLine {
  id: string;
  offsetSeconds: number;
  serviceKey: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  requestId?: string;
  traceId?: string;
  endpoint?: string;
  statusCode?: number;
  durationMs?: number;
  message: string;
  errorCode?: string;
  metadata: Record<string, unknown>;
}

export interface TraceSpan {
  spanKey: string;
  parentSpanKey?: string;
  serviceKey: string;
  operation: string;
  startOffsetMs: number;
  durationMs: number;
  status: string;
}

export interface Trace {
  traceKey: string;
  label: string;
  offsetSeconds: number;
  totalDurationMs: number;
  status: string;
  spans: TraceSpan[];
}

export interface MetricPoint {
  offsetMinutes: number;
  value: number;
}

export type MetricSeries = Record<string, MetricPoint[]>; // keyed by `${serviceKey}:${metricName}`

export interface CandidateCause {
  key: string;
  label: string;
  category: HypothesisCategory;
  /** True if this candidate describes something that genuinely happened
   * (even if it's not the root cause) — a symptom, immediate cause, or
   * contributing factor that's actually part of this incident. False for
   * pure distractors that evidence should rule out. Used to give partial
   * credit for "on the right track" vs. "chasing a red herring". */
  onCausalChain: boolean;
}

export interface CandidatePreventiveAction {
  key: string;
  label: string;
  addressesRootCause: boolean;
}

export interface ActionConsequence {
  /** Absolute values to set on the incident metrics baseline after this action. */
  setMetricShift?: { metricName: string; serviceKey: string; deltaPct: number }[];
  setMitigated?: boolean;
  setPermanentFixApplied?: boolean;
  setVerified?: boolean;
  advancesStateTo?: IncidentState;
  narrative: string;
}

export interface ActionDefinition {
  actionType: ActionType;
  targetServiceKey?: string;
  risk: ActionRisk;
  requiresConfirmation: boolean;
  simMinutesCost: number;
  description: string;
  expectedEffect: string;
  /** Hidden ground truth — never sent to the client before evaluation. */
  validity: ActionValidity;
  isMitigation: boolean;
  isPermanentFix: boolean;
  consequence: ActionConsequence;
}

export interface StakeholderTrigger {
  persona: string;
  triggerAfterMinutes: number;
  prompt: string;
  requiresFields: string[];
}

export interface ScoringRubric {
  detection: number;
  investigation: number;
  evidenceQuality: number;
  rootCause: number;
  mitigation: number;
  permanentFix: number;
  communication: number;
  prevention: number;
}

export interface EscalationRule {
  afterMinutesWithoutMitigation: number;
  errorRateMultiplier: number;
  addAlertType?: string;
}

/** The full hidden ground truth for one incident template. Server-only. */
export interface IncidentTemplate {
  id: string;
  slug: string;
  incidentType: string;
  difficulty: "FOUNDATION" | "INTERMEDIATE" | "ADVANCED" | "PRODUCTION" | "EXPERT";
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";
  description: string;
  businessImpact: string;
  targetRole: string;
  targetSkills: string[];
  incidentStartedOffsetMinutes: number;

  rootCauseKey: string;
  rootCauseSummary: string;
  contributingFactorSummary: string;
  candidateCauseKeys: CandidateCause[];
  /** IDs of the specific artifacts (log line ids, trace keys, deployment
   * ids) that genuinely support the root cause — e.g. "trace-incident-01"
   * or a specific log line's own `id`. These ARE the same ids the client
   * sees when it fetches logs/traces/deployments; nothing about a log
   * line's `id` reveals it's on this list. Only this list itself (which
   * lives solely on the hidden `incident_templates` base table, never on
   * `incident_template_public`) is what's actually hidden. */
  expectedEvidenceKeys: string[];
  candidatePreventiveActions: CandidatePreventiveAction[];
  preventiveActionKeys: string[];
  scoringRubric: ScoringRubric;
  escalationRules: EscalationRule[];

  services: ServiceNode[];
  timeline: TimelineEvent[];
  deployments: DeploymentRecord[];
  alerts: AlertRecord[];
  logLines: LogLine[];
  traces: Trace[];
  metricSeries: MetricSeries;
  actionDefs: ActionDefinition[];
  stakeholderTriggers: StakeholderTrigger[];

  published: boolean;
}

/** The safe subset ever sent to the browser before evaluation. */
export type IncidentTemplatePublic = Omit<
  IncidentTemplate,
  | "rootCauseKey"
  | "rootCauseSummary"
  | "contributingFactorSummary"
  | "candidateCauseKeys"
  | "expectedEvidenceKeys"
  | "candidatePreventiveActions"
  | "preventiveActionKeys"
  | "scoringRubric"
  | "escalationRules"
  | "actionDefs"
  | "logLines"
> & {
  actionDefs: Omit<ActionDefinition, "validity" | "isMitigation" | "isPermanentFix" | "consequence">[];
  logLines: LogLine[];
  // NOTE: onCausalChain / addressesRootCause are intentionally stripped —
  // revealing which candidates are "real" vs. red herrings would hand the
  // student the answer before they've gathered evidence for it.
  candidateCauseKeys: Omit<CandidateCause, "onCausalChain">[];
  candidatePreventiveActions: Omit<CandidatePreventiveAction, "addressesRootCause">[];
};

export interface IncidentInstance {
  id: string;
  templateId: string;
  ownerId: string;
  code: string;
  state: IncidentState;
  simStartedAt: string | null;
  simMinutesElapsed: number;
  escalationLevel: number;
  mitigated: boolean;
  permanentFixApplied: boolean;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentEventRow {
  id: string;
  incidentId: string;
  actorId: string;
  eventType: string;
  payload: Record<string, unknown>;
  simMinutesAt: number;
  createdAt: string;
}

export interface HypothesisRow {
  id: string;
  incidentId: string;
  ownerId: string;
  statement: string;
  category: HypothesisCategory;
  implicatedCauseKey: string;
  evidenceRefs: string[];
  status: "OPEN" | "CONFIRMED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}

export interface ActionLogRow {
  id: string;
  incidentId: string;
  ownerId: string;
  actionType: ActionType;
  targetServiceKey: string | null;
  idempotencyKey: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  simMinutesAt: number;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  incidentId: string;
  ownerId: string;
  sender: string;
  direction: "INBOUND" | "OUTBOUND";
  body: Record<string, unknown>;
  simMinutesAt: number;
  createdAt: string;
}

export interface OutboundMessageBody {
  currentImpact: string;
  knownEvidence: string;
  hypothesis: string;
  mitigation: string;
  currentStatus: string;
  nextAction: string;
}

export interface PostmortemRow {
  id: string;
  incidentId: string;
  ownerId: string;
  summary: string | null;
  businessImpact: string | null;
  timeline: string | null;
  rootCause: string | null;
  contributingFactors: string | null;
  detection: string | null;
  mitigation: string | null;
  permanentFix: string | null;
  whatWentWell: string | null;
  whatWentWrong: string | null;
  preventiveActionKeys: string[];
  preventiveActionsNotes: string | null;
  fiveWhys: string[];
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
  updatedAt: string;
}

export const POSTMORTEM_REQUIRED_FIELDS = [
  "summary",
  "businessImpact",
  "timeline",
  "rootCause",
  "contributingFactors",
  "detection",
  "mitigation",
  "permanentFix",
  "whatWentWell",
  "whatWentWrong",
] as const;

export interface CategoryScores {
  detection: number;
  investigation: number;
  evidenceQuality: number;
  rootCause: number;
  mitigation: number;
  permanentFix: number;
  communication: number;
  prevention: number;
}

export interface IndependenceSummary {
  hintsUsed: number;
  assistanceModesUsed: string[];
  rootCauseRevealed: boolean;
  aiCallsMade: number;
  independentInvestigationRatio: number; // 0..1
}

export interface EvaluationResult {
  incidentId: string;
  version: number;
  categoryScores: CategoryScores;
  engineeringJudgment: number;
  overall: number;
  topStrength: string;
  topGap: string;
  nextRecommendation: string;
  independence: IndependenceSummary;
  aiFeedback: AiCoachingFeedback | null;
}

export interface AiCoachingFeedback {
  source: "ai" | "fallback";
  sections: {
    observation: string;
    evidence: string;
    impact: string;
    recommendation: string;
    example: string;
  }[];
}

export const ASSISTANCE_MODES = [
  "NO_ASSISTANCE",
  "CONCEPT_HELP",
  "OBSERVABILITY_HELP",
  "DIRECTIONAL_HINT",
  "STRONG_GUIDANCE",
] as const;
export type AssistanceMode = (typeof ASSISTANCE_MODES)[number];

export interface EngineeringEvidenceRow {
  category:
    | "DEBUGGING"
    | "OBSERVABILITY"
    | "ROOT_CAUSE_ANALYSIS"
    | "INCIDENT_RESPONSE"
    | "PERFORMANCE"
    | "DATABASE"
    | "SECURITY"
    | "PRODUCTION_REASONING"
    | "COMMUNICATION"
    | "ENGINEERING_JUDGMENT";
  payload: Record<string, unknown>;
}
