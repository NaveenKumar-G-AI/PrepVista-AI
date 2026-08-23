export class ApiError extends Error {
  status: number;
  duplicates?: unknown[];
  constructor(status: number, message: string, duplicates?: unknown[]) {
    super(message);
    this.status = status;
    this.duplicates = duplicates;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.duplicates);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) => request<{ user: any }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: any }>("/auth/me"),

  listCompanies: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]);
    return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/companies?${qs.toString()}`);
  },
  getCompany: (id: string) => request<any>(`/companies/${id}`),
  createCompany: (input: any, allowDuplicate = false) =>
    request<any>(`/companies${allowDuplicate ? "?allowDuplicate=true" : ""}`, { method: "POST", body: JSON.stringify(input) }),
  updateCompany: (id: string, patch: any) => request<any>(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  archiveCompany: (id: string) => request<any>(`/companies/${id}/archive`, { method: "POST" }),
  changeStage: (id: string, stage: string, reason?: string) =>
    request<any>(`/companies/${id}/stage`, { method: "POST", body: JSON.stringify({ stage, reason }) }),
  companyHistory: (id: string) => request<{ history: any[] }>(`/companies/${id}/history`),
  relationshipStages: () => request<{ stages: string[] }>(`/companies/relationship-stages`),

  listContacts: (companyId: string) => request<{ contacts: any[] }>(`/companies/${companyId}/contacts`),
  createContact: (companyId: string, input: any) =>
    request<any>(`/companies/${companyId}/contacts`, { method: "POST", body: JSON.stringify(input) }),
  updateContact: (id: string, patch: any) => request<any>(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  setPrimaryContact: (id: string) => request<any>(`/contacts/${id}/set-primary`, { method: "POST" }),
  deactivateContact: (id: string) => request<any>(`/contacts/${id}/deactivate`, { method: "POST" }),

  listActivities: (companyId: string) => request<{ activities: any[] }>(`/companies/${companyId}/activities`),
  logActivity: (companyId: string, input: any) =>
    request<any>(`/companies/${companyId}/activities`, { method: "POST", body: JSON.stringify(input) }),

  listCompanyFollowups: (companyId: string) => request<{ followups: any[] }>(`/companies/${companyId}/followups`),
  createFollowup: (companyId: string, input: any) =>
    request<any>(`/companies/${companyId}/followups`, { method: "POST", body: JSON.stringify(input) }),
  completeFollowup: (id: string) => request<any>(`/followups/${id}/complete`, { method: "POST" }),
  cancelFollowup: (id: string) => request<any>(`/followups/${id}/cancel`, { method: "POST" }),
  updateFollowup: (id: string, patch: any) => request<any>(`/followups/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  followupCentre: (ownerId?: string) => request<{ buckets: Record<string, any[]> }>(`/followups${ownerId ? `?ownerId=${ownerId}` : ""}`),

  listNotes: (companyId: string) => request<{ notes: any[] }>(`/companies/${companyId}/notes`),
  createNote: (companyId: string, body: string) =>
    request<any>(`/companies/${companyId}/notes`, { method: "POST", body: JSON.stringify({ body }) }),

  listIndustries: () => request<{ industries: any[] }>(`/lookups/industries`),
  createIndustry: (name: string) => request<any>(`/lookups/industries`, { method: "POST", body: JSON.stringify({ name }) }),

  recruiterPulse: () => request<any>(`/command-centre/recruiter-pulse`),
};
