// ============================================================================
// Integration ports (Phase 2, 5-6, 18, 28-29, 40, 45-50, 60-61, 67)
//
// This file is the anti-corruption layer between Feature 34 and the rest of
// CodeForge AI. Nothing outside this file (and its adapters) is allowed to
// know what the Skill Signal Engine, Mastery System, Growth Tracking, Role
// Skill Gap Analysis, Role Readiness Engine, Next Best Action Engine,
// Reasoning Verification, Understanding Check, Debugging Coach, or the AI
// gateway actually look like internally. Swap the adapter, keep every engine
// and orchestration file untouched.
//
// WHEN WIRING THIS INTO THE REAL CODEBASE: implement each port against your
// actual services/repositories in src/integration/adapters/, then replace the
// in-memory adapters wired in src/orchestration/container.ts. Nothing else
// needs to change.
// ============================================================================

import type {
  ActorContext,
  EvidenceReference,
  OrgId,
  RoleContext,
  RoleId,
  SkillEvidence,
  SkillGapSummary,
  SkillId,
  StudentEvidenceContext,
  StudentId,
} from "../domain/types.js";

export type { SkillGapSummary } from "../domain/types.js";

// ---- Phase 5: role requirements (read-only, authoritative elsewhere) ------

export interface RoleRequirementsPort {
  getRoleContext(roleId: RoleId, orgId: OrgId): Promise<RoleContext>;
}

// ---- Phase 6: student evidence context (read-only) -------------------------

export interface StudentEvidencePort {
  getStudentEvidenceContext(studentId: StudentId, roleId: RoleId, orgId: OrgId): Promise<StudentEvidenceContext>;
}

// ---- Phase 45: Skill Signal Engine — the ONLY place evidence is written ---

export interface SkillSignalEnginePort {
  /**
   * Feed evidence signals derived from an interview. This is a submission of
   * SIGNALS, not a mastery write — Phase 46 is explicit that the Mastery
   * Level System (downstream of Skill Signal) decides how signals move
   * mastery, and Feature 34 never touches mastery state directly.
   */
  submitSkillEvidence(evidence: SkillEvidence[]): Promise<{ accepted: number; rejected: number }>;
}

// ---- Phase 46: Mastery Level System — read-only from this feature ---------

export interface MasterySnapshot {
  skillId: SkillId;
  masteryLevel: number; // 0-1
  label: string;
  lastUpdated: string;
}

export interface MasteryLevelSystemPort {
  /** Read current mastery for difficulty calibration / summaries. Never written to directly. */
  getMasterySnapshot(studentId: StudentId, skillId: SkillId): Promise<MasterySnapshot | null>;
}

// ---- Phase 47: Technical Growth Tracking -----------------------------------

export interface GrowthEvidenceEvent {
  studentId: StudentId;
  skillId: SkillId;
  source: "TECHNICAL_INTERVIEW";
  sourceReference: EvidenceReference;
  evidenceState: SkillEvidence["evidenceState"];
  confidence: number;
  occurredAt: string;
}

export interface TechnicalGrowthTrackingPort {
  /** Appends a normalized evidence event to the student's growth history. Never overwrites history. */
  recordGrowthEvent(event: GrowthEvidenceEvent): Promise<void>;
}

// ---- Phase 48: Role Skill Gap Analysis — read-only from this feature ------

export interface RoleSkillGapPort {
  /** Used to select Phase 51 gap-verification interview targets. Feature 34 never rewrites gap state directly. */
  getSkillGaps(studentId: StudentId, roleId: RoleId, orgId: OrgId): Promise<SkillGapSummary[]>;
}

// ---- Phase 49: Role Readiness Engine — read-only from this feature --------

export interface ReadinessSnapshot {
  roleId: RoleId;
  readinessScore: number; // 0-1
  label: string;
}

export interface RoleReadinessPort {
  getReadinessSnapshot(studentId: StudentId, roleId: RoleId, orgId: OrgId): Promise<ReadinessSnapshot | null>;
}

// ---- Phase 50, 53: Next Best Action Engine ---------------------------------

export interface GapIdentifiedNotification {
  studentId: StudentId;
  roleId: RoleId;
  skillId: SkillId;
  evidenceState: SkillEvidence["evidenceState"];
  reason: string;
  sourceSessionId: string;
}

export interface NextBestActionPort {
  /**
   * Push a structured "here's a gap, with evidence" signal. Feature 34 does
   * NOT decide what the student should do next (Phase 53) — it only reports.
   */
  notifyGapIdentified(notification: GapIdentifiedNotification): Promise<void>;
}

// ---- Phase 28: Reasoning Verification --------------------------------------

export interface ReasoningVerificationInput {
  claim: string;
  studentResponse: string;
  supportingEvidence: EvidenceReference[];
}

export interface ReasoningVerificationResult {
  assumptionsIdentified: string[];
  logicalProgressionSound: boolean;
  alternativesConsidered: boolean;
  tradeoffsAddressed: boolean;
  notes: string;
}

export interface ReasoningVerificationPort {
  verifyReasoning(input: ReasoningVerificationInput): Promise<ReasoningVerificationResult>;
}

// ---- Phase 29: Understanding Check ------------------------------------------

export interface UnderstandingCheckInput {
  skillId: SkillId;
  implementationEvidence: EvidenceReference[];
  studentExplanation: string;
}

export interface UnderstandingCheckResult {
  understandingDemonstrated: "DEMONSTRATED" | "PARTIAL" | "NOT_DEMONSTRATED";
  distinguishesImplementationFromUnderstanding: boolean;
  notes: string;
}

export interface UnderstandingCheckPort {
  checkUnderstanding(input: UnderstandingCheckInput): Promise<UnderstandingCheckResult>;
}

// ---- Phase 18: Debugging Coach ---------------------------------------------

export interface DebuggingContext {
  scenarioId: string;
  symptom: string;
  relevantCode?: string;
}

export interface DebuggingReasoningResult {
  symptomIdentified: boolean;
  hypothesisQuality: "STRONG" | "ADEQUATE" | "WEAK";
  investigationStrategySound: boolean;
  rootCauseReasoningSound: boolean;
  fixValid: boolean | "NOT_ANSWERED";
}

export interface DebuggingCoachPort {
  getDebuggingScenario(skillId: SkillId, difficulty: number): Promise<DebuggingContext | null>;
  evaluateDebuggingReasoning(context: DebuggingContext, studentResponse: string): Promise<DebuggingReasoningResult>;
}

// ---- Code / complexity analysis (previously-built Complexity Analysis Engine) --

export interface ComplexityAnalysisSummary {
  submissionId: string;
  timeComplexity: string; // e.g. "O(n log n)" — deterministically derived upstream, not guessed here
  spaceComplexity: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface CodeAnalysisPort {
  getComplexityAnalysis(submissionId: string): Promise<ComplexityAnalysisSummary | null>;
}

// ---- Phase 10, 25, 39-42: AI gateway — strictly grounded, never authoritative --

export interface AIQuestionGenerationContext {
  roleId: RoleId;
  skillId: SkillId;
  mode: string;
  difficulty: number;
  /** Only what the student's actual evidence supports — never the full DB. */
  evidenceSummaries: string[];
  codeExcerpt?: { language: string; content: string };
  priorQuestionTextsInSession: string[];
  /** How many questions this SPECIFIC skill has already had in this session — lets a provider (or the deterministic fixture) vary phrasing deliberately rather than by accident. */
  priorQuestionCountForSkill: number;
}

export interface AIGeneratedQuestion {
  text: string;
  groundedOn: string[]; // which evidenceSummaries/codeExcerpt entries this question actually references
}

export interface AIEvaluationContext {
  questionText: string;
  studentResponseText: string;
  skillId: SkillId;
  roleId: RoleId;
  evidenceSummaries: string[];
  codeExcerpt?: { language: string; content: string };
  dimensionsRequested: string[];
}

export interface AIEvaluationRaw {
  correctness: string;
  reasoningQuality?: string;
  understanding?: string;
  depth?: string;
  application?: string;
  communicationClarity?: string;
  consistency?: string;
  rationale: string;
  citedEvidence: string[]; // must be a subset of what was supplied — validated by the caller
}

export class AIGatewayError extends Error {
  constructor(
    message: string,
    public override readonly cause: "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_RESPONSE_SHAPE" | "NOT_CONFIGURED",
  ) {
    super(message);
    this.name = "AIGatewayError";
  }
}

export interface AIGatewayPort {
  generateQuestion(context: AIQuestionGenerationContext): Promise<AIGeneratedQuestion>;
  evaluateResponse(context: AIEvaluationContext): Promise<AIEvaluationRaw>;
}

// ---- Phase 31: Voice ---------------------------------------------------------

export interface VoicePort {
  transcribe(audio: { data: Uint8Array; mimeType: string }): Promise<{ text: string }>;
  synthesize(text: string): Promise<{ audioUrl: string }>;
}

// ---- Phase 60-61: Authorization ---------------------------------------------

export type InterviewAction =
  | "INTERVIEW_CREATE"
  | "INTERVIEW_START"
  | "INTERVIEW_VIEW"
  | "INTERVIEW_RESPOND"
  | "INTERVIEW_PAUSE"
  | "INTERVIEW_RESUME"
  | "INTERVIEW_COMPLETE"
  | "INTERVIEW_CANCEL"
  | "INTERVIEW_VIEW_HISTORY"
  | "INTERVIEW_VIEW_INSTITUTIONAL_REPORTS";

export interface AuthzPort {
  can(actor: ActorContext, action: InterviewAction, resourceOrgId: OrgId, resourceStudentId?: StudentId): Promise<boolean>;
}

// ---- Phase 67: Observability --------------------------------------------------

export type InterviewEventName =
  | "interview.started"
  | "interview.completed"
  | "interview.cancelled"
  | "question.generation_failed"
  | "response.processed"
  | "evaluation.latency"
  | "evaluation.failed"
  | "transcription.failed"
  | "ai.failure"
  | "session.recovered"
  | "queue.latency";

export interface ObservabilityPort {
  track(event: InterviewEventName, payload: Record<string, unknown>): void;
}

// ---- Aggregate bundle used by orchestration --------------------------------

export interface IntegrationPorts {
  roleRequirements: RoleRequirementsPort;
  studentEvidence: StudentEvidencePort;
  skillSignalEngine: SkillSignalEnginePort;
  mastery: MasteryLevelSystemPort;
  growthTracking: TechnicalGrowthTrackingPort;
  roleSkillGap: RoleSkillGapPort;
  roleReadiness: RoleReadinessPort;
  nextBestAction: NextBestActionPort;
  reasoningVerification: ReasoningVerificationPort;
  understandingCheck: UnderstandingCheckPort;
  debuggingCoach: DebuggingCoachPort;
  codeAnalysis: CodeAnalysisPort;
  aiGateway: AIGatewayPort;
  voice: VoicePort;
  authz: AuthzPort;
  observability: ObservabilityPort;
}
