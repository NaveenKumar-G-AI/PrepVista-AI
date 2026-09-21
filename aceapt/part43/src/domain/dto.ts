import { DiagnosticConfig, DomainName, Question, SelfReportedConfidence, StudentProfileRef } from './types';
import { AdaptiveMode } from './state';

export interface StartDiagnosticInput {
  student: StudentProfileRef;
  config: Partial<Omit<DiagnosticConfig, 'requiredDomains'>> & { requiredDomains: DomainName[] };
}

export interface ProgressSnapshot {
  questionsAsked: number;
  minQuestions: number;
  maxQuestions: number;
  coverage: Record<string, { questionsAsked: number; minimumRequired: number; satisfied: boolean }>;
  fatigueSeverity: string;
}

export interface NextQuestionResult {
  done: boolean;
  question?: Question;
  progress: ProgressSnapshot;
  /** Structured, for observability/frontend styling - never render mode/reason verbatim to the student (spec section 46). */
  status?: { mode: AdaptiveMode; skillId: string; friendlyStatus: string };
  stoppingReason?: string;
  message?: string;
}

export interface SubmitResponseInput {
  questionId: string;
  isCorrect: boolean;
  responseTimeMs: number;
  confidence?: SelfReportedConfidence;
  submittedAnswer?: unknown;
  clientRequestId?: string;
}

export interface SkillSummary {
  skillId: string;
  skillLabel: string;
  capabilityLabel: string;
  confidenceLabel: string;
  evidenceCount: number;
}

export interface NextBestAction {
  skillId: string;
  skillLabel: string;
  status: string;
  priority: number;
  recommendedAction: string;
  reason: string;
}

export interface LearningHandoffPayload {
  skill: string;
  status: string;
  priority: number;
  difficultyStart: number;
  evidenceConfidence: string;
  recommendedAction: string;
}

export interface AdaptiveResult {
  sessionId: string;
  isFinal: boolean;
  generatedAt: string;
  currentCapability: SkillSummary[];
  strongestAreas: SkillSummary[];
  developmentAreas: SkillSummary[];
  difficultyBoundary: Record<string, number>;
  speedPattern: Record<string, string>;
  accuracyPattern: Record<string, number>;
  confidencePattern: Record<string, string>;
  evidenceConfidenceOverall: string;
  unknownAreas: string[];
  nextBestActions: NextBestAction[];
  learningHandoff: LearningHandoffPayload[];
}
