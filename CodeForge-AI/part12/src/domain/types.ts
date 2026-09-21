/**
 * CodeForge AI — Submission System
 * Core domain types. These mirror the DB schema (db/migrations/0001_*.sql) field-for-
 * field so repository implementations are thin mapping layers, not translation logic.
 */
import type {
  SubmissionStatus,
  SubmissionMode,
  Verdict,
  EvaluationJobKind,
  EvaluationJobStatus,
  SubmissionFileRole,
  UserRole,
} from './enums.js';

export interface Attempt {
  id: string;
  userId: string;
  problemId: string;
  assessmentId: string | null;
  mode: SubmissionMode;
  startedAt: string;
  createdAt: string;
}

export interface SubmissionFileInput {
  filename: string;
  path: string;
  content: string;
  role: SubmissionFileRole;
  ordinal: number;
}

export interface SubmissionFile extends SubmissionFileInput {
  id: string;
  submissionId: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

/** Frozen at creation time; nothing here is ever re-resolved against a "current" value. */
export interface VersionBinding {
  problemVersionId: string;
  testSuiteVersionId: string;
  checkerVersionId: string;
  executionConfigSnapshot: ExecutionConfig;
}

export interface ExecutionConfig {
  cpuTimeLimitMs: number;
  wallTimeLimitMs: number;
  memoryLimitKb: number;
  outputLimitBytes: number;
  processLimit: number;
  networkAllowed: boolean;
  compilerFlags?: string[];
}

export interface Submission extends VersionBinding {
  id: string;
  attemptId: string;
  userId: string;
  problemId: string;
  assessmentId: string | null;
  mode: SubmissionMode;

  language: string;
  languageVersion: string;
  sourceFingerprint: string;
  totalSourceBytes: number;
  fileCount: number;

  status: SubmissionStatus;
  currentEvaluationResultId: string | null;

  idempotencyKey: string;
  submissionNumber: number;

  serverReceivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationJob {
  id: string;
  submissionId: string;
  kind: EvaluationJobKind;
  status: EvaluationJobStatus;
  priority: number;
  claimedBy: string | null;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  reevaluationReason: string | null;
  reevaluationActorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceUsage {
  cpuMs: number;
  memoryKb: number;
  wallMs: number;
  outputBytes: number;
}

export interface PublicTestCaseResult {
  name: string;
  passed: boolean;
  wallMs: number;
}

export interface PublicResult {
  totalTests: number;
  passed: number;
  failed: number;
  cases: PublicTestCaseResult[];
}

/**
 * AGGREGATE ONLY, by construction — see resultAggregation.ts's buildHiddenResult(),
 * which is the only place a HiddenResult may legally be built. There is no field here
 * for inputs, expected outputs, per-test identifiers, weights, or checker/generator
 * internals — the type itself is the enforcement, not just a convention.
 */
export interface HiddenResult {
  totalGroups: number;
  passedGroups: number;
  totalWeight: number;
  earnedWeight: number;
}

export interface EvaluationResult {
  id: string;
  evaluationJobId: string;
  submissionId: string;
  compilationStatus: 'NOT_REQUIRED' | 'SUCCESS' | 'FAILED';
  compilationOutput: string | null;
  publicResult: PublicResult;
  hiddenResult: HiddenResult;
  resourceUsage: ResourceUsage;
  verdict: Verdict;
  score: number;
  terminationReason: string | null;
  isOfficial: boolean;
  finalizedAt: string;
  createdAt: string;
}

export interface ReEvaluation {
  id: string;
  submissionId: string;
  previousEvaluationResultId: string;
  newEvaluationResultId: string | null;
  newEvaluationJobId: string;
  reason: string;
  actorId: string;
  actorRole: UserRole;
  previousVerdict: Verdict;
  previousScore: number;
  newVerdict: Verdict | null;
  newScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  actorRole: UserRole | null;
  submissionId: string | null;
  evaluationJobId: string | null;
  correlationId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** The authenticated caller, as resolved server-side. Never trust a client-supplied version of this. */
export interface AuthenticatedActor {
  userId: string;
  role: UserRole;
}

/** What the *submission request* looks like before anything is validated or frozen. */
export interface SubmissionRequest {
  attemptId: string;
  files: SubmissionFileInput[];
  language: string;
  languageVersion: string;
  idempotencyKey: string;
}
