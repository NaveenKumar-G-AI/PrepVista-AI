// These mirror backend/src/engine/analytics.ts and the API response shapes
// in backend/src/routes/sessionService.ts. In a monorepo these would live in
// a shared package; duplicated here to keep this a standalone reference
// build (see README "Integration notes").

export interface ClientQuestion {
  id: string;
  sequenceIndex: number;
  prompt: string;
  options: string[];
}

export interface SessionInfo {
  id: string;
  status: string;
  startedAt: string;
  durationSec: number;
}

export interface ResponseState {
  questionId: string;
  status: "unvisited" | "viewed" | "answered";
  selectedIndex: number | null;
  markedForReview: boolean;
}

export type DecisionLabel =
  | "Not Reached"
  | "Bad Skip"
  | "Good Skip"
  | "Late Skip"
  | "Overinvestment"
  | "Efficient Solve"
  | "Good Attempt"
  | "Premature Guess";

export interface PerQuestionEvidence {
  sequenceIndex: number;
  questionId: string;
  concept: string;
  difficulty: string;
  attempted: boolean;
  correct: boolean;
  timeSec: number;
  markedForReview: boolean;
  status: "correct" | "wrong" | "unattempted";
  decision: DecisionLabel;
}

export interface SegmentEvidence {
  label: string;
  accuracyPct: number | null;
  attempted: number;
}

export interface BiggestLeak {
  type: "time-concentration" | "unattempted" | "degradation" | "none";
  text: string;
  questionNumbers?: number[];
}

export interface SessionEvidence {
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  score: number;
  maxScore: number;
  accuracyPct: number;
  attemptRatePct: number;
  totalTimeSec: number;
  avgTimePerQuestionSec: number;
  perQuestion: PerQuestionEvidence[];
  segments: SegmentEvidence[];
  degrading: boolean;
  overinvested: PerQuestionEvidence[];
  topTwoTimeSharePct: number;
  opportunityCostEquivalentQuestions: number;
  postErrorAccuracyPct: number | null;
  recoveryRatePct: number | null;
  recoverableCount: number;
  speedLabel: "Fast" | "Moderate" | "Slow";
  accuracyLabel: "High" | "Moderate" | "Low";
  speedAccuracyProfile: string;
  selectionQuality: "Strong" | "Moderate" | "Weak";
  biggestLeak: BiggestLeak;
  navigationJumps: number;
}

export interface QuestionReviewItem {
  sequenceIndex: number;
  prompt: string;
  options: string[];
  concept: string;
  difficulty: string;
  correctIndex: number;
  explanation: string;
  yourIndex: number | null;
}

export interface ReportResponse {
  session: { id: string; status: string };
  evidence: SessionEvidence;
  narrative: { text: string; source: "ai" | "fallback" | null };
  questionReview: QuestionReviewItem[];
}

export interface DrillChoice {
  type: "selection" | "concept";
  concept?: string;
  label: string;
  reason: string;
}

export interface MockHistoryEntry {
  sessionId: string;
  score: number;
  maxScore: number;
  accuracyPct: number;
  selectionQuality: string;
  completedAt: string;
}
