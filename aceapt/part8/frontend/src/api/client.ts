const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const TOKEN_KEY = "aceapt_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, json?.error || `Request failed with status ${res.status}`);
  }
  return json as T;
}

// ---------- Types (mirroring the backend's response shapes) ----------

export interface Student {
  id: string;
  email: string;
  name: string;
}

export interface Skill {
  id: string;
  key: string;
  name: string;
  category: string;
  importance: number;
}

export type MasteryStateEnum =
  | "UNKNOWN"
  | "INTRODUCED"
  | "LEARNING"
  | "PRACTICING"
  | "IMPROVING"
  | "PROVISIONALLY_MASTERED"
  | "VERIFIED_MASTERED"
  | "STABLE_MASTERED"
  | "AT_RISK"
  | "REGRESSED";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface DimensionScores {
  conceptScore: number | null;
  executionScore: number | null;
  transferScore: number | null;
  retentionScore: number | null;
  timedScore: number | null;
  consistencyScore: number | null;
}

export interface MasteryMapEntry {
  skillId: string;
  skillKey: string;
  skillName: string;
  category: string;
  state: MasteryStateEnum;
  confidence: ConfidenceLevel | null;
  lastVerifiedAt: string | null;
  nextReviewAt: string | null;
}

export interface MasteryMap {
  categories: Array<{ category: string; skills: MasteryMapEntry[] }>;
}

export interface MasteryStateFull extends DimensionScores {
  state: MasteryStateEnum;
  confidence: ConfidenceLevel;
  lastVerifiedAt?: string | null;
  nextReviewAt?: string | null;
}

export interface SkillDetailResponse {
  skill: Skill;
  state: MasteryStateFull;
}

export interface ExplainResponse {
  state: MasteryStateEnum;
  confidence: ConfidenceLevel;
  dimensions: DimensionScores;
  rationale: string[];
  evidenceCounts: { concept: number; execution: number; transfer: number; novel: number; delayed: number; consistencyWindow: number };
  regression: { flagged: boolean; kind: "AT_RISK" | "REGRESSED" | null; dropFromSnapshot: number | null };
}

export interface HistoryEvent {
  id: string;
  eventType: string;
  description: string;
  createdAt: string;
}
export interface BeforeAfter {
  before: { accuracy: number | null; transferAccuracy: number | null; timedAccuracy: number | null; capturedAt: string | null };
  after: { accuracy: number | null; transferAccuracy: number | null; timedAccuracy: number | null; capturedAt: string | null };
}
export interface HistoryResponse {
  timeline: HistoryEvent[];
  beforeAfter: BeforeAfter | null;
}

export interface ReviewQueueItem {
  skillId: string;
  priorityScore: number;
  reason: string;
  dueAt: string;
  estimatedMinutes: number;
  skill: Skill;
}

export interface StartVerificationResponse {
  attemptId: string;
  objective: string;
  totalQuestions: number;
}

export interface CurrentQuestionResponse {
  attemptId: string;
  objective: string;
  questionIndex: number;
  totalQuestions: number;
  question: { id: string; prompt: string; choices: { id: string; text: string }[]; timed: boolean; expectedTimeSeconds: number };
  skillNameVisible: boolean;
}

export interface VerificationResult {
  result: "MASTERY_VERIFIED" | "NOT_STABLE_YET";
  state: MasteryStateEnum;
  confidence: ConfidenceLevel;
  dimensions: DimensionScores;
  correctCount: number;
  totalQuestions: number;
  nextRecommendedFocus: string | null;
}

// ---------- API surface ----------

export const api = {
  register: (input: { email: string; password: string; name: string }) => request<{ token: string; student: Student }>("POST", "/auth/register", input),
  login: (input: { email: string; password: string }) => request<{ token: string; student: Student }>("POST", "/auth/login", input),
  me: () => request<{ student: Student }>("GET", "/auth/me"),

  listSkills: () => request<{ skills: Skill[] }>("GET", "/skills"),
  getMasteryMap: () => request<MasteryMap>("GET", "/mastery"),
  getSkillDetail: (skillId: string) => request<SkillDetailResponse>("GET", `/mastery/${skillId}`),
  getExplain: (skillId: string) => request<ExplainResponse>("GET", `/mastery/${skillId}/explain`),
  getHistory: (skillId: string) => request<HistoryResponse>("GET", `/mastery/history/${skillId}`),
  getReviewQueue: () => request<{ queue: ReviewQueueItem[] }>("GET", "/mastery/reviews"),
  skipReview: (skillId: string) => request<void>("POST", `/mastery/reviews/${skillId}/skip`),

  startVerification: (skillId: string, objective?: string) => request<StartVerificationResponse>("POST", `/mastery/${skillId}/verify/start`, objective ? { objective } : {}),
  getCurrentQuestion: (attemptId: string) => request<CurrentQuestionResponse>("GET", `/mastery/verify/${attemptId}`),
  submitAnswer: (attemptId: string, skillId: string, studentAnswer: string, timeTakenSeconds: number) =>
    request<{ isSessionComplete: boolean }>("POST", `/mastery/verify/${attemptId}/answer`, { skillId, studentAnswer, timeTakenSeconds }),
  completeVerification: (attemptId: string, skillId: string) => request<VerificationResult>("POST", `/mastery/verify/${attemptId}/complete`, { skillId }),
  abandonVerification: (attemptId: string) => request<void>("POST", `/mastery/verify/${attemptId}/abandon`),
};
