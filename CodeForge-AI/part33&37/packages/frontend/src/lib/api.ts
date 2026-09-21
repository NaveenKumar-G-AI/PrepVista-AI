/**
 * API Client - Centralized HTTP client with auth, error handling, and types
 */
import { getSession, signOut } from 'next-auth/react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  requireAuth?: boolean;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthHeader(): Promise<string | null> {
  // In a real app, this would come from your auth solution
  // For now, we'll use a simple approach - the token should be stored in localStorage or cookies
  if (typeof window !== 'undefined') {
    return localStorage.getItem('accessToken');
  }
  return null;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, requireAuth = true, headers, ...fetchOptions } = options;

  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (requireAuth) {
    const token = await getAuthHeader();
    if (token) {
      (requestHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = buildUrl(path, params);

  const response = await fetch(url, {
    ...fetchOptions,
    headers: requestHeaders,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  let data: any;
  if (isJson) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = data?.error || `HTTP ${response.status}`;
    const code = data?.code || 'API_ERROR';
    throw new ApiError(message, response.status, code, data?.details);
  }

  return data as T;
}

/* ---- Convenience Methods ---- */
export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>, requireAuth = true) =>
    apiClient<T>(path, { method: 'GET', params, requireAuth }),

  post: <T>(path: string, body: unknown, requireAuth = true) =>
    apiClient<T>(path, { method: 'POST', body: JSON.stringify(body), requireAuth }),

  patch: <T>(path: string, body: unknown, requireAuth = true) =>
    apiClient<T>(path, { method: 'PATCH', body: JSON.stringify(body), requireAuth }),

  put: <T>(path: string, body: unknown, requireAuth = true) =>
    apiClient<T>(path, { method: 'PUT', body: JSON.stringify(body), requireAuth }),

  delete: <T>(path: string, requireAuth = true) =>
    apiClient<T>(path, { method: 'DELETE', requireAuth }),
};

/* ---- Auth Helpers ---- */
export async function login(email: string, password: string) {
  const response = await api.post<{
    user: any;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>('/auth/login', { email, password }, false);

  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
  }

  return response;
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
  role?: string;
  collegeId?: string;
}) {
  const response = await api.post<{
    user: any;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>('/auth/register', data, false);

  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
  }

  return response;
}

export async function refreshAccessToken() {
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
  if (!refreshToken) throw new Error('No refresh token');

  const response = await api.post<{
    user: any;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>('/auth/refresh', { refreshToken }, false);

  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
  }

  return response;
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

export { ApiError };