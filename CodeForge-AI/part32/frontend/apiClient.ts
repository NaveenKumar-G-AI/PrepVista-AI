import type { RoleGapProfile } from "./types";

export interface RoleSkillGapClientConfig {
  baseUrl: string;
  /** Returns the header(s) to attach for auth - swap this for your real
   *  session/JWT header once the backend's auth stub is replaced. */
  getAuthHeaders: () => Record<string, string>;
}

export class RoleSkillGapClient {
  constructor(private config: RoleSkillGapClientConfig) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      headers: { ...this.config.getAuthHeaders() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Request failed with status ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  getGapProfile(studentId: string, roleId: string): Promise<RoleGapProfile> {
    return this.get(`/students/${encodeURIComponent(studentId)}/roles/${encodeURIComponent(roleId)}/gap-profile`);
  }

  getHistory(studentId: string, roleId: string, skillId: string) {
    return this.get(
      `/students/${encodeURIComponent(studentId)}/roles/${encodeURIComponent(roleId)}/skills/${encodeURIComponent(skillId)}/history`,
    );
  }
}
