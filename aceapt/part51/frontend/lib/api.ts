const BASE_URL = process.env.NEXT_PUBLIC_ACCURACY_API_URL ?? "/api"; // adjust to the host app's routing

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("aceapt_token") : null; // placeholder — wire to real ACEAPT session
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json.data as T;
}

export const accuracyApi = {
  getDashboard: () => request("GET", "/accuracy/dashboard"),
  getProfile: () => request("GET", "/accuracy/profile"),
  getBottlenecks: () => request("GET", "/accuracy/bottlenecks"),
  getErrorPatternCard: () => request("GET", "/accuracy/error-pattern-card"),
  startTraining: (body: unknown) => request("POST", "/accuracy/training", body),
  getActiveSession: () => request("GET", "/accuracy/training/active"),
  submitAttempt: (sessionId: string, sequenceNumber: number, body: unknown) =>
    request("POST", `/accuracy/training/${sessionId}/attempts/${sequenceNumber}`, body),
  transition: (sessionId: string, to: string) => request("POST", `/accuracy/training/${sessionId}/transition`, { to }),
  selfCheck: (body: unknown) => request("POST", "/accuracy/self-check", body)
};
