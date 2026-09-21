// Core domain types for CodeForge AI — Code Review Mode.
//
// Intentionally framework-agnostic (no Express/Postgres imports here) so this
// module can be dropped into a Node/Express service, a Next.js API route, or
// a Supabase/Deno edge function with no changes.

export type FindingCategory =
  | 'CORRECTNESS' | 'LOGIC' | 'REGRESSION' | 'EDGE_CASE' | 'PERFORMANCE'
  | 'COMPLEXITY' | 'MEMORY' | 'READABILITY' | 'MAINTAINABILITY' | 'DUPLICATION'
  | 'ERROR_HANDLING' | 'RESOURCE_MANAGEMENT' | 'ARCHITECTURE' | 'API_BEHAVIOR'
  | 'TEST_COVERAGE' | 'SECURITY' | 'NAMING' | 'DESIGN' | 'COMPATIBILITY' | 'DOCUMENTATION';

export type Severity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type Priority = 'MUST_FIX' | 'SHOULD_FIX' | 'CONSIDER' | 'OPTIONAL';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type FindingStatus =
  | 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'FIXED' | 'RESOLVED'
  | 'REOPENED' | 'WONT_FIX' | 'SUPERSEDED';

export type ReReviewOutcome =
  | 'RESOLVED' | 'STILL_PRESENT' | 'REGRESSED' | 'SUPERSEDED' | 'MOVED' | 'INCONCLUSIVE';

export type ResponseType =
  | 'ACKNOWLEDGE' | 'FIXED' | 'EXPLAIN' | 'DISAGREE' | 'REQUEST_CLARIFICATION' | 'WONT_FIX';

export type ReviewDecisionType =
  | 'APPROVE' | 'APPROVE_WITH_SUGGESTIONS' | 'CHANGES_REQUESTED' | 'BLOCKED' | 'NEEDS_REVIEW';

export type ReadinessStatus = 'READY' | 'READY_WITH_SUGGESTIONS' | 'NOT_READY' | 'BLOCKED';

export type ChangeClassification =
  | 'BUG_FIX' | 'FEATURE_ADDITION' | 'REFACTOR' | 'OPTIMIZATION' | 'ERROR_HANDLING_CHANGE'
  | 'API_CHANGE' | 'DATA_MODEL_CHANGE' | 'TEST_ONLY_CHANGE' | 'DEPENDENCY_CHANGE'
  | 'CONFIGURATION_CHANGE' | 'ARCHITECTURE_CHANGE';

export type ReviewMode = 'LEARNING' | 'ASSESSMENT' | 'INTERVIEW';
export type ReviewerPersona = 'PR_REVIEWER' | 'SENIOR_ENGINEER' | 'STAFF_ENGINEER' | 'MENTOR' | 'INTERVIEWER';

export interface SourceFile {
  path: string;
  content: string;
}

export interface DiffRegion {
  file: string;
  kind: 'added' | 'removed' | 'modified';
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
  beforeSnippet: string;
  afterSnippet: string;
}

export interface Evidence {
  source: 'diff' | 'correctness' | 'complexity' | 'quality' | 'reasoning' | 'security' | 'debugging' | 'ai';
  id: string;
  description: string;
  data?: Record<string, unknown>;
  deterministic: boolean;
}

export interface SourceLocation {
  file: string;
  startLine: number;
  endLine: number;
}

export interface ReviewFinding {
  id: string;
  reviewId: string;
  category: FindingCategory;
  severity: Severity;
  priority: Priority;
  confidence: Confidence;
  title: string;
  description: string;
  whyItMatters: string;
  evidence: Evidence[];
  sourceLocation?: SourceLocation;
  sourceSnippet: string;
  suggestedDirection?: string;
  status: FindingStatus;
  fingerprint: string;
  isPositive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewMessage {
  id: string;
  findingId: string;
  author: 'reviewer' | 'developer';
  responseType?: ResponseType;
  content: string;
  createdAt: string;
}

export interface ProblemContext {
  id: string;
  title: string;
  constraints?: Record<string, unknown>;
  requirements?: string[];
}

export interface ProjectContext {
  role?: 'backend' | 'frontend' | 'ml' | 'fullstack';
  isMultiFile: boolean;
}

export interface ReviewDecision {
  decision: ReviewDecisionType;
  readiness: ReadinessStatus;
  rationale: string;
  computedAt: string;
}

export interface ReviewSummaryCounts {
  filesChanged: number;
  linesChanged: number;
  blockers: number;
  highPriority: number;
  suggestions: number;
  positive: number;
}

export interface ReviewSession {
  id: string;
  baseRevisionId: string;
  targetRevisionId: string;
  problemContext?: ProblemContext;
  projectContext?: ProjectContext;
  changeClassification: ChangeClassification;
  mode: ReviewMode;
  persona: ReviewerPersona;
  findings: ReviewFinding[];
  decision?: ReviewDecision;
  analysisVersion: string;
  rulesVersion: string;
  createdAt: string;
}

export interface ReviewEvent {
  id: string;
  reviewId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
