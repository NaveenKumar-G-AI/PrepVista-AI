const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

/**
 * Dev-only auth: sends the plain x-dev-* headers the backend's auth
 * middleware accepts when JWT_SECRET is blank (see backend/.env.example
 * and backend/src/api/middleware/auth.ts). Swap this for a real bearer
 * token once the backend has a JWT_SECRET configured.
 */
export interface DevIdentity {
  studentId: string;
  tenantId: string;
  role?: 'STUDENT' | 'TRAINER' | 'CONTENT_REVIEWER' | 'ADMIN';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, identity: DevIdentity, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-dev-student-id': identity.studentId,
      'x-dev-tenant-id': identity.tenantId,
      ...(identity.role ? { 'x-dev-role': identity.role } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, identity: DevIdentity) => request<T>(path, identity),
  post: <T>(path: string, identity: DevIdentity, body?: unknown) =>
    request<T>(path, identity, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, identity: DevIdentity, body?: unknown) =>
    request<T>(path, identity, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

export { BASE_URL };
