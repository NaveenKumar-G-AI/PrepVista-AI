// ============================================================================
// Minimal fetch-based client for the Feature 34 API (see
// src/api/routes/interviews.ts). No framework dependency — swap this for
// whatever the host app's existing API client convention is (e.g. if
// CodeForge already has a typed fetch wrapper or React Query setup, use
// that instead and keep only the types/endpoints below as reference).
//
// Auth: the host app should already have the real actor resolved
// server-side (see src/api/middleware/actor.ts's integration note) — this
// client does not attach auth headers itself; assumes the host app's
// existing fetch wrapper/interceptor does that.
// ============================================================================

export interface PublicSessionView {
  id: string;
  state: "CREATED" | "READY" | "IN_PROGRESS" | "PAUSED" | "RESUMED" | "COMPLETED" | "EVALUATION_PENDING" | "EVALUATION_FAILED" | "CANCELLED";
  mode: string;
  roleId: string;
  questionsAskedCount: number;
  currentQuestionId?: string;
}

export interface PublicQuestion {
  id: string;
  text: string;
  skillId: string;
  isFollowUp: boolean;
}

export interface InterviewSummary {
  sessionId: string;
  generatedAt: string;
  technicalStrengths: string[];
  verifiedSkills: string[];
  partiallyVerifiedSkills: string[];
  technicalGaps: string[];
  uncertainSkills: string[];
  reasoningStrength: "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_EVIDENCE";
  debuggingStrength: "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";
  projectUnderstanding: "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";
  technicalCommunication: "CLEAR" | "ADEQUATE" | "UNCLEAR" | "INSUFFICIENT_EVIDENCE";
  additionalVerificationRequired: string[];
  assessmentComplete: boolean;
}

export interface InstitutionalReport {
  roleId: string;
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  commonGapSkillIds: Array<{ skillId: string; occurrences: number }>;
  averageQuestionsPerSession: number;
}

type NextQuestionOutcome =
  | { status: "QUESTION_READY" | "AWAITING_RESPONSE"; question: PublicQuestion; session: PublicSessionView }
  | { status: "AWAITING_EVALUATION"; questionId: string; session: PublicSessionView }
  | { status: "READY_TO_COMPLETE"; session: PublicSessionView }
  | { status: "GENERATION_FAILED"; reason: string; session: PublicSessionView };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request to ${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const interviewApi = {
  createInterview: (input: { studentId: string; roleId: string; mode: string; targetSkillIds?: string[] }) =>
    request<{ session: PublicSessionView }>("/interviews", { method: "POST", body: JSON.stringify(input) }),

  createGapVerificationInterview: (input: { studentId: string; roleId: string; maxSkills?: number }) =>
    request<{ session: PublicSessionView }>("/interviews/gap-verification", { method: "POST", body: JSON.stringify(input) }),

  startSession: (sessionId: string) => request<{ session: PublicSessionView }>(`/interviews/sessions/${sessionId}/start`, { method: "POST" }),

  getNextQuestion: (sessionId: string) => request<NextQuestionOutcome>(`/interviews/sessions/${sessionId}/next-question`),

  submitResponse: (sessionId: string, input: { questionId: string; content: string; modality: "TEXT" | "VOICE"; idempotencyKey: string }) =>
    request<{ evaluation: { status: string }; session: PublicSessionView }>(`/interviews/sessions/${sessionId}/responses`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  pauseSession: (sessionId: string) => request<{ session: PublicSessionView }>(`/interviews/sessions/${sessionId}/pause`, { method: "POST" }),
  resumeSession: (sessionId: string) => request<{ session: PublicSessionView }>(`/interviews/sessions/${sessionId}/resume`, { method: "POST" }),
  cancelSession: (sessionId: string, reason: string) =>
    request<{ session: PublicSessionView }>(`/interviews/sessions/${sessionId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),

  completeSession: (sessionId: string) =>
    request<{ session: PublicSessionView; summary: InterviewSummary }>(`/interviews/sessions/${sessionId}/complete`, { method: "POST" }),

  /** Read-only — safe to call any time after completion (revisiting history, deep-linking), unlike completeSession which mutates state and can only run once. */
  getSummary: (sessionId: string) => request<{ summary: InterviewSummary }>(`/interviews/sessions/${sessionId}/summary`),

  getInstitutionalReport: (roleId: string, studentIds: string[]) =>
    request<{ report: InstitutionalReport }>(`/interviews/institutional-report?roleId=${encodeURIComponent(roleId)}&studentIds=${encodeURIComponent(studentIds.join(","))}`),
};

/**
 * Generates a fresh idempotency key for ONE logical submission attempt.
 * Call this ONCE when the student submits an answer and hold onto the
 * result (e.g. in component state) — if that same submission needs to be
 * retried (network failure, etc.), reuse the SAME key rather than calling
 * this again, or the retry stops being idempotent (Phase 36).
 */
export function makeIdempotencyKey(sessionId: string, questionId: string): string {
  return `${sessionId}:${questionId}:${Math.random().toString(36).slice(2)}`;
}
