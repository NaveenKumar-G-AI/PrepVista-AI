import { env, usingMockFeature6 } from '../../config/env';
import { SkillEvidence } from '../../types';
import { EvidenceRepo } from '../../db/repositories';

/**
 * Integration point into Feature 6 (Assessment + Exam Simulation) — see
 * PLAN §35. Feature 7 reads diagnostic evidence from Feature 6 and, after an
 * action completes, asks Feature 6 to reassess so improvement is measured,
 * not assumed (§12).
 *
 * When FEATURE6_API_URL is left blank (see .env.example), evidence is read
 * from the local store instead of a live call, seeded with a demo student so
 * the engine has something real to reason over.
 */
export class Feature6Client {
  static async getLatestEvidence(studentId: string): Promise<SkillEvidence[]> {
    if (usingMockFeature6) {
      return EvidenceRepo.find((e) => e.student_id === studentId);
    }
    const res = await fetch(`${env.feature6.apiUrl}/students/${studentId}/evidence`, {
      headers: { authorization: `Bearer ${env.feature6.apiKey}` },
    });
    if (!res.ok) throw new Error(`Feature 6 evidence fetch failed: ${res.status}`);
    return (await res.json()) as SkillEvidence[];
  }

  static async triggerReassessment(studentId: string, skillIds: string[]): Promise<{ triggered: boolean }> {
    if (usingMockFeature6) {
      return { triggered: true };
    }
    const res = await fetch(`${env.feature6.apiUrl}/students/${studentId}/reassess`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.feature6.apiKey}`,
      },
      body: JSON.stringify({ skill_ids: skillIds }),
    });
    if (!res.ok) throw new Error(`Feature 6 reassessment trigger failed: ${res.status}`);
    return (await res.json()) as { triggered: boolean };
  }
}
