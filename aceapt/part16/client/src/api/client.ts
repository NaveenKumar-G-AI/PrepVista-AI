export interface AuthContext {
  studentId: string;
  token: string;
}

async function request<T>(path: string, auth: AuthContext | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth) {
    headers['x-student-id'] = auth.studentId;
    if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  runDemo: () => request<import('../types').DemoRunResponse>('/demo/run', null, { method: 'POST' }),

  submitAttempt: (auth: AuthContext, body: Record<string, unknown>) =>
    request<import('../types').AttemptOutcome>('/attempts', auth, { method: 'POST', body: JSON.stringify(body) }),

  submitStuck: (auth: AuthContext, body: Record<string, unknown>) =>
    request<import('../types').AttemptOutcome>('/stuck', auth, { method: 'POST', body: JSON.stringify(body) }),

  stuckReasons: (auth: AuthContext) => request<import('../types').StuckReason[]>('/stuck/reasons', auth),

  startIntervention: (auth: AuthContext, id: string) =>
    request<import('../types').InterventionRecord>(`/interventions/${id}/start`, auth, { method: 'POST' }),

  reassess: (auth: AuthContext, id: string, body: Record<string, unknown>) =>
    request<import('../types').ReassessmentOutcome>(`/interventions/${id}/reassess`, auth, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  requestHint: (auth: AuthContext, id: string) =>
    request<import('../types').HintResult>(`/interventions/${id}/hint`, auth, { method: 'POST' }),

  explainDifferently: (auth: AuthContext, id: string, previousStyles: string[]) =>
    request<import('../types').ExplainResult>(`/interventions/${id}/explain-differently`, auth, {
      method: 'POST',
      body: JSON.stringify({ previousStyles }),
    }),

  errorDeconstruction: (auth: AuthContext, id: string, solutionPath: unknown) =>
    request<import('../types').ErrorDeconstructionResult>(`/interventions/${id}/error-deconstruction`, auth, {
      method: 'POST',
      body: JSON.stringify({ solutionPath }),
    }),

  startRecoverySession: (auth: AuthContext, body: Record<string, unknown>) =>
    request<import('../types').RecoverySession>('/recovery-sessions', auth, { method: 'POST', body: JSON.stringify(body) }),

  completeRecoveryStep: (auth: AuthContext, sessionId: string, stepIndex: number) =>
    request<import('../types').RecoverySession>(`/recovery-sessions/${sessionId}/steps/${stepIndex}/complete`, auth, {
      method: 'POST',
    }),

  history: (auth: AuthContext) =>
    request<import('../types').InterventionHistoryRow[]>(`/students/${auth.studentId}/interventions/history`, auth),

  journey: (auth: AuthContext) =>
    request<{ journey: unknown; mastery: unknown }>(`/students/${auth.studentId}/journey`, auth),
};
