export type ConfidenceLevel = "insufficient" | "low" | "moderate" | "high";
export type RecurrenceStatus = "isolated" | "recurring" | "clustered" | "resolved" | "regressed";
export type SessionState = "READY" | "ACTIVE" | "FEEDBACK" | "RETRY" | "VERIFICATION" | "COMPLETED" | "PAUSED" | "ABANDONED";

export interface AccuracyResult {
  scope: string;
  scopeId: string | null;
  accuracy: number | null;
  independentAccuracy: number | null;
  timedAccuracy: number | null;
  novelAccuracy: number | null;
  sampleSize: number;
  confidence: ConfidenceLevel;
}

export interface BottleneckEntry {
  skillId: string;
  errorType: string;
  interventionType: string;
  recurrenceStatus: RecurrenceStatus;
  frequency: number;
  recentFrequency: number;
  reason: string;
}

export interface AccuracyDashboard {
  overallAccuracy: number | null;
  independentAccuracy: number | null;
  timedAccuracy: number | null;
  sampleSize: number;
  confidence: ConfidenceLevel;
  strongestSkill: { skillId: string; accuracy: number } | null;
  currentFocus: BottleneckEntry | null;
  currentStatus: "improving" | "stable" | "needs_attention" | "insufficient_evidence";
}

export interface AccuracyProfile {
  overall: AccuracyResult;
  bySkill: AccuracyResult[];
  byDifficulty: AccuracyResult[];
  bySessionPosition: AccuracyResult[];
}

export interface AttemptFeedback {
  attempt: { id: string; isCorrect: boolean; errorType: string | null };
  recurrenceStatus: RecurrenceStatus | null;
  policyDecision: { interventionType: string | null; priorityRaised: boolean; rationale: string } | null;
  message: string;
  recommendedNextState: SessionState;
  session: { id: string; status: SessionState; cursorPosition: number };
}

export interface TrainingResult {
  session: { id: string; status: SessionState };
  outcome: {
    beforePct: number | null;
    afterPct: number | null;
    questionsTotal: number;
    questionsCorrect: number;
    independentVerificationPassed: boolean | null;
    mainIssue: string | null;
    summaryMessage: string;
  };
}
