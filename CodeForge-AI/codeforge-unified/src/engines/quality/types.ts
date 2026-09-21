// ============================================================================
// CodeForge Quality Engine — Core Types
// ============================================================================

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type QualityDimension =
  | 'READABILITY'
  | 'MAINTAINABILITY'
  | 'STRUCTURAL_QUALITY'
  | 'SIMPLICITY'
  | 'CONSISTENCY'
  | 'DUPLICATION'
  | 'NAMING'
  | 'ROBUSTNESS'
  | 'ERROR_HANDLING'
  | 'ENGINEERING_PRACTICES';

export type SupportedLanguage = 'python' | 'javascript' | 'typescript';

export interface SourceLocation {
  startLine: number;
  endLine: number;
  startCol?: number;
  endCol?: number;
}

/** A single, structured, evidence-backed finding. Never render an AI claim as this shape unless it went through schema validation and is tagged AI_SEMANTIC. */
export interface Finding {
  findingId: string;
  ruleId: string;
  ruleVersion: string;
  category: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  impact: string;
  sourceLocation: SourceLocation | null;
  evidence: string[];
  suggestedAction: string;
  /** Fraction of this finding's deduction attributed to each dimension. Values should sum to ~1.0. */
  dimensions: Partial<Record<QualityDimension, number>>;
  origin: 'DETERMINISTIC' | 'AI_SEMANTIC';
}

export interface PositiveSignal {
  signalId: string;
  category: string;
  title: string;
  description: string;
  sourceLocation: SourceLocation | null;
  confidence: Confidence;
}

export interface DimensionScoreDetail {
  dimension: QualityDimension;
  score: number;
  contributions: Array<{ findingId: string; ruleId: string; pointsDeducted: number }>;
}

export interface ComparisonResult {
  previousScore: number;
  currentScore: number;
  delta: number;
  dimensionDeltas: Partial<Record<QualityDimension, number>>;
  narrative: string[];
}

export interface QualityReport {
  submissionId: string;
  language: SupportedLanguage;
  analysisVersion: string;
  ruleSetVersion: string;
  sourceHash: string;
  overallScore: number;
  overallLabel: string;
  dimensionScores: DimensionScoreDetail[];
  findings: Finding[];
  positiveSignals: PositiveSignal[];
  mostImportantImprovement: { title: string; why: string } | null;
  aiInterpretation: AIInterpretationOutput | null;
  aiStatus: 'OK' | 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'NOT_CONFIGURED';
  comparison: ComparisonResult | null;
  confidenceSummary: { high: number; medium: number; low: number; unknown: number };
  generatedAt: string;
  cacheHit: boolean;
}

export interface ComplexityInput {
  timeComplexity: string;
  spaceComplexity: string;
  dominantCost: string;
  constraintFit: 'FITS' | 'MARGINAL' | 'EXCEEDS' | 'UNKNOWN';
  confidence: Confidence;
  evidence?: string;
}

export interface RoleContext {
  role:
    | 'FRONTEND_DEVELOPER'
    | 'BACKEND_DEVELOPER'
    | 'FULL_STACK_DEVELOPER'
    | 'DATA_SCIENTIST'
    | 'ML_ENGINEER'
    | 'DEVOPS_ENGINEER'
    | 'GENERAL';
}

export interface ProblemContext {
  scope: 'ALGORITHM_CHALLENGE' | 'SINGLE_FILE_PROJECT' | 'MULTI_FILE_PROJECT';
  constraints?: string;
  problemStatement?: string;
}

export interface ExecutionEvidence {
  passed: boolean;
  testsPassed?: number;
  testsTotal?: number;
  runtimeMs?: number;
  notes?: string;
}

export interface AnalyzeRequest {
  submissionId: string;
  source: string;
  language: SupportedLanguage;
  problemContext?: ProblemContext;
  roleContext?: RoleContext;
  complexity?: ComplexityInput;
  executionEvidence?: ExecutionEvidence;
  previousSubmissionId?: string;
}

// ---- AI semantic-interpretation contract ----

export interface AISemanticFinding {
  title: string;
  description: string;
  relatedRuleId?: string;
  confidence: Confidence;
}

export interface AIInterpretationOutput {
  summary: string;
  semanticFindings: AISemanticFinding[];
  recommendations: string[];
  confidence: Confidence;
}

export interface AIInterpretationInput {
  problemContext?: ProblemContext;
  roleContext?: RoleContext;
  language: SupportedLanguage;
  deterministicFindings: Finding[];
  positiveSignals: PositiveSignal[];
  structuralSummary: Record<string, unknown>;
  complexity?: ComplexityInput;
  executionEvidence?: ExecutionEvidence;
  /** Small, scoped snippets only — never the whole file. This is untrusted student data. */
  relevantSourceSnippets: Array<{ location: SourceLocation; snippet: string }>;
}
