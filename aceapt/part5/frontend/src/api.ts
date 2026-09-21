import {
  AttemptResult,
  DashboardData,
  Hint,
  MasteryOverviewEntry,
  PracticeSession,
  Question,
  SessionSummary,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const TOKEN_KEY = "aceapt_token";
const STUDENT_KEY = "aceapt_student_id";

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getStudentId: () => localStorage.getItem(STUDENT_KEY),
  setSession: (token: string, studentId: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(STUDENT_KEY, studentId);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STUDENT_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = auth.getToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    auth.clear();
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export const api = {
  devLogin: (studentId: string, role: "STUDENT" | "TPO_ADMIN" = "STUDENT") =>
    request<{ token: string }>("/auth/dev-login", { method: "POST", body: JSON.stringify({ studentId, role }) }),

  getDashboard: () => request<DashboardData>("/dashboard"),
  getMasteryOverview: (studentId: string) => request<MasteryOverviewEntry[]>(`/students/${studentId}/mastery`),
  getActiveSession: () => request<{ session: PracticeSession; question: Question | null } | null>("/sessions/active"),

  startSession: (mode?: string) =>
    request<{ session: PracticeSession; question: Question; resumed: boolean }>("/sessions", {
      method: "POST",
      body: JSON.stringify(mode ? { mode } : {}),
    }),
  submitAttempt: (sessionId: string, body: { selectedOptionId: string | null; timeToStartMs: number; confidence?: number | null }) =>
    request<AttemptResult>(`/sessions/${sessionId}/attempts`, { method: "POST", body: JSON.stringify(body) }),
  getHint: (sessionId: string) => request<{ hint: Hint | null; isFinal: boolean; nextLevelAvailable: number | null }>(`/sessions/${sessionId}/hints`, { method: "POST" }),
  advance: (sessionId: string, retryType?: string) =>
    request<{ session: PracticeSession; question: Question; completed: false } | { session: PracticeSession; summary: SessionSummary; completed: true }>(
      `/sessions/${sessionId}/advance`,
      { method: "POST", body: JSON.stringify(retryType ? { retryType } : {}) }
    ),
  completeSession: (sessionId: string) => request<{ session: PracticeSession; summary: SessionSummary; completed: true }>(`/sessions/${sessionId}/complete`, { method: "POST" }),
};
