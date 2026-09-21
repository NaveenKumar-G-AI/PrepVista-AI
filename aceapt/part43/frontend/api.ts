// Thin client over the Feature 43 REST API (src/api/routes.ts).
// TODO(integration): point this at your real backend origin/gateway, and
// swap the x-student-id header approach for whatever your app already uses
// to authenticate requests (cookies, Authorization header, etc.) - the
// dev-only header check lives in src/api/middleware/auth.ts.

const BASE_URL = ''; // e.g. '/api' or 'https://your-gateway.example.com/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface StartConfig {
  requiredDomains: string[];
  objective?: 'general_baseline' | 'placement_preparation' | 'company_preparation' | 'weakness_investigation' | 'reassessment';
  companyId?: string;
  minQuestionsPerDomain?: number;
  minQuestions?: number;
  maxQuestions?: number;
  targetEvidenceConfidence?: 'low' | 'moderate' | 'high';
}

export interface ApiQuestion {
  id: string;
  format: 'mcq' | 'numeric' | 'short_answer';
  content?: unknown; // opaque - render via your existing question component
}

export interface ApiProgress {
  questionsAsked: number;
  minQuestions: number;
  maxQuestions: number;
  coverage: Record<string, { questionsAsked: number; minimumRequired: number; satisfied: boolean }>;
  fatigueSeverity: 'none' | 'mild' | 'moderate' | 'high';
}

export interface ApiNextQuestion {
  done: boolean;
  question?: ApiQuestion;
  progress: ApiProgress;
  status?: { mode: string; skillId: string; friendlyStatus: string };
  message?: string;
}

export interface ApiSkillSummary {
  skillId: string;
  skillLabel: string;
  capabilityLabel: string;
  confidenceLabel: string;
  evidenceCount: number;
}

export interface ApiNextBestAction {
  skillId: string;
  skillLabel: string;
  status: string;
  priority: number;
  recommendedAction: string;
  reason: string;
}

export interface ApiResult {
  sessionId: string;
  isFinal: boolean;
  currentCapability: ApiSkillSummary[];
  strongestAreas: ApiSkillSummary[];
  developmentAreas: ApiSkillSummary[];
  speedPattern: Record<string, string>;
  accuracyPattern: Record<string, number>;
  evidenceConfidenceOverall: string;
  unknownAreas: string[];
  nextBestActions: ApiNextBestAction[];
}

export interface ApiExplanation {
  skillLabel: string;
  narrative: string;
  confidence: string;
}

export const AdaptiveDiagnosticApi = {
  start: (config: StartConfig) =>
    request<{ sessionId: string; status: string }>('/adaptive-diagnostics', { method: 'POST', body: JSON.stringify(config) }),
  nextQuestion: (sessionId: string) => request<ApiNextQuestion>(`/adaptive-diagnostics/${sessionId}/next-question`),
  submitResponse: (
    sessionId: string,
    body: { questionId: string; isCorrect: boolean; responseTimeMs: number; confidence?: { level: 'low' | 'medium' | 'high' } }
  ) => request<ApiProgress>(`/adaptive-diagnostics/${sessionId}/responses`, { method: 'POST', body: JSON.stringify(body) }),
  pause: (sessionId: string) => request<void>(`/adaptive-diagnostics/${sessionId}/pause`, { method: 'POST' }),
  resume: (sessionId: string) => request<{ sessionId: string; status: string }>(`/adaptive-diagnostics/${sessionId}/resume`, { method: 'POST' }),
  complete: (sessionId: string) => request<ApiResult>(`/adaptive-diagnostics/${sessionId}/complete`, { method: 'POST' }),
  result: (sessionId: string) => request<ApiResult>(`/adaptive-diagnostics/${sessionId}/result`),
  why: (sessionId: string, skillId: string) => request<ApiExplanation>(`/adaptive-diagnostics/${sessionId}/why/${skillId}`),
};
