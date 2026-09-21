const STUDENT_ID_KEY = "aceapt.studentId";

export function getStudentId(): string | null {
  return localStorage.getItem(STUDENT_ID_KEY);
}

export function setStudentId(id: string): void {
  localStorage.setItem(STUDENT_ID_KEY, id.trim());
}

export function clearStudentId(): void {
  localStorage.removeItem(STUDENT_ID_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const studentId = getStudentId();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(studentId ? { "X-Student-Id": studentId } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // response wasn't JSON — keep the status text
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};
