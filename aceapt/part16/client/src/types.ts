export type SignalStatus = 'ok' | 'warning' | 'fail' | 'unknown';

export interface DiagnosticUiPanel {
  conceptStatus: SignalStatus;
  methodStatus: SignalStatus;
  calculationStatus: SignalStatus;
  likelyIssueLabel: string;
}

export type Confidence = 'HIGH' | 'MODERATE' | 'LOW';

export interface RootCauseCandidate {
  cause: string;
  confidence: Confidence;
  evidenceSummary: string;
}

export interface Diagnosis {
  attemptId: string;
  studentId: string;
  skillId: string;
  primary: RootCauseCandidate;
  secondary: RootCauseCandidate[];
  isMultiFactor: boolean;
  insufficientEvidence: boolean;
  uiPanel: DiagnosticUiPanel;
  createdAt: string;
}

export interface InterventionRecommendation {
  rootCause: string;
  interventionType: string;
  escalationLevel: number;
  label: string;
  description: string;
  estimatedMinutes: number;
  rationale: string;
}

export interface InterventionRecord {
  id: string;
  studentId: string;
  skillId: string;
  microSkillId?: string;
  rootCause: string;
  interventionType: string;
  escalationLevel: number;
  status: string;
  beforeAccuracy?: number;
  afterAccuracy?: number;
  createdAt: string;
}

export interface AttemptOutcome {
  diagnosis: Diagnosis;
  intervention: InterventionRecord | null;
  recommendation: InterventionRecommendation | null;
}

export interface EffectivenessResult {
  improved: boolean;
  beforeAccuracy: number;
  afterAccuracy: number;
  delta: number;
  independenceTrend: string;
  transferStatus: string;
  note: string;
}

export interface ReassessmentOutcome {
  intervention: InterventionRecord;
  effectiveness: EffectivenessResult;
  nextRecommendation: InterventionRecommendation | null;
  masteryUpdate: { masteryState: string; transferState: string; retentionState: string };
  journeyUpdate: { currentSkillId: string; status: string; note: string };
}

export interface HintResult {
  level: number;
  text: string;
  isFinal: boolean;
  source: 'llm' | 'template';
}

export interface ExplainResult {
  style: string;
  styleLabel: string;
  text: string;
  source: 'llm' | 'template';
}

export interface ErrorDeconstructionResult {
  available: boolean;
  reason?: string;
  steps?: { stepNumber: number; description: string; correct: boolean }[];
  correctThroughStep?: number;
  errorStep?: { stepNumber: number; description: string } | null;
  why?: string;
  howToAvoid?: string;
}

export interface RecoveryStep {
  index: number;
  type: string;
  title: string;
  estimatedMinutes: number;
  status: 'pending' | 'completed';
}

export interface RecoverySession {
  id: string;
  studentId: string;
  skillId: string;
  rootCause: string;
  triggeringPattern: string;
  steps: RecoveryStep[];
  status: 'in_progress' | 'completed' | 'abandoned';
}

export interface InterventionHistoryRow {
  skillLabel: string;
  rootCauseLabel: string;
  interventionLabel: string;
  result: string;
  next: string;
  createdAt: string;
}

export interface DemoStep {
  stage: 'BEFORE' | 'DIAGNOSE' | 'INTERVENE' | 'VERIFY' | 'UPDATED_STATE' | 'UPDATED_JOURNEY';
  title: string;
  detail: any;
}

export interface DemoRunResponse {
  studentId: string;
  token: string;
  steps: DemoStep[];
}

export interface StuckReason {
  code: string;
  label: string;
}
