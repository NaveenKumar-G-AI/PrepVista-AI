// Thin, typed fetch client for the Code Review Mode API (src/api/routes.ts).
// Swap `baseUrl`/auth header wiring for however the real CodeForge frontend
// already authenticates its requests (e.g. a Supabase session token).

export interface ReviewClientConfig {
  baseUrl: string;
  userId: string;
}

async function request<T>(config: ReviewClientConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-user-id': config.userId, ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
  return body as T;
}

export const reviewApi = {
  createReview: (config: ReviewClientConfig, payload: unknown) =>
    request(config, '/api/reviews', { method: 'POST', body: JSON.stringify(payload) }),

  getReview: (config: ReviewClientConfig, reviewId: string) => request(config, `/api/reviews/${reviewId}`),

  respond: (config: ReviewClientConfig, reviewId: string, findingId: string, responseType: string, content: string) =>
    request(config, `/api/reviews/${reviewId}/findings/${findingId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ responseType, content }),
    }),

  reReview: (config: ReviewClientConfig, reviewId: string, payload: unknown) =>
    request(config, `/api/reviews/${reviewId}/re-review`, { method: 'POST', body: JSON.stringify(payload) }),
};
