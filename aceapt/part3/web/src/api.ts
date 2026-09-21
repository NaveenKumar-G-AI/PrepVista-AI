import type { SkillDetailResponse, StudentSkillProfile } from './types';

// This demo ships one seeded student and no login flow. In the real product
// this id comes from the actual authenticated session, exactly like the
// server-side x-student-id stand-in documented in src/api/auth.ts.
const STUDENT_ID = 'demo-student-1';
const HEADERS = { 'x-student-id': STUDENT_ID, 'Content-Type': 'application/json' };

export async function fetchProfile(): Promise<StudentSkillProfile> {
  const res = await fetch(`/api/profile/${STUDENT_ID}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  return res.json() as Promise<StudentSkillProfile>;
}

export async function fetchSkillDetail(skillId: string): Promise<SkillDetailResponse> {
  const res = await fetch(`/api/skill/${STUDENT_ID}/${skillId}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to load skill detail (${res.status})`);
  return res.json() as Promise<SkillDetailResponse>;
}
