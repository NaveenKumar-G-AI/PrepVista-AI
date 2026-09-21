import {
  Blueprint,
  PressureMode,
  PublicQuestion,
  PublicSimulationView,
  SimulationHistoryEntry,
  SimulationReport,
} from '../types';

// ============================================================
// API CLIENT
// ============================================================
// Talks to the Feature 9 backend over plain fetch. Swap API_BASE for
// wherever the real ACEAPT gateway is deployed, and replace
// devLogin() with your real login flow - see backend/INTEGRATION.md.

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function devLogin(studentId: string): Promise<string> {
  const { token } = await request<{ token: string }>('/dev/token', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  });
  setAuthToken(token);
  return token;
}

export function listBlueprints(): Promise<{ blueprints: Blueprint[] }> {
  return request('/blueprints');
}

export function startSimulation(blueprintId: string, pressureMode?: PressureMode) {
  return request<{ simulation: PublicSimulationView; firstQuestion: PublicQuestion }>('/simulations/start', {
    method: 'POST',
    body: JSON.stringify({ blueprintId, pressureMode }),
  });
}

export function getSimulation(id: string) {
  return request<{ simulation: PublicSimulationView }>(`/simulations/${id}`);
}

export function getQuestionAt(id: string, sequence: number) {
  return request<{ question: PublicQuestion }>(`/simulations/${id}/questions/${sequence}`);
}

export function logOpenEvent(id: string, questionId: string) {
  return request(`/simulations/${id}/events`, {
    method: 'POST',
    body: JSON.stringify({ questionId, type: 'OPEN' }),
  });
}

export function answerQuestion(id: string, questionId: string, optionId: string) {
  return request<{ simulation: PublicSimulationView }>(`/simulations/${id}/answer`, {
    method: 'POST',
    body: JSON.stringify({ questionId, optionId }),
  });
}

export function skipQuestion(id: string, questionId: string) {
  return request<{ simulation: PublicSimulationView }>(`/simulations/${id}/skip`, {
    method: 'POST',
    body: JSON.stringify({ questionId }),
  });
}

export function returnToQuestion(id: string, questionId: string) {
  return request<{ simulation: PublicSimulationView }>(`/simulations/${id}/return`, {
    method: 'POST',
    body: JSON.stringify({ questionId }),
  });
}

export function gotoQuestion(id: string, index: number) {
  return request<{ simulation: PublicSimulationView }>(`/simulations/${id}/goto`, {
    method: 'POST',
    body: JSON.stringify({ index }),
  });
}

export function completeSimulation(id: string) {
  return request<{ report: SimulationReport }>(`/simulations/${id}/complete`, { method: 'POST' });
}

export function getReport(id: string) {
  return request<{ report: SimulationReport }>(`/simulations/${id}/report`);
}

export function listHistory() {
  return request<{ history: SimulationHistoryEntry[] }>('/simulations/history');
}
