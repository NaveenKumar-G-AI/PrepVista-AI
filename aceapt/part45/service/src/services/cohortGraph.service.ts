import { studentStateRepository } from '../repositories/studentState.repository';
import { loadGraphSnapshot } from './graphQuery.service';
import { adapters } from '../integrations';

export interface CohortSkillDistribution {
  skillCode: string;
  displayName: string;
  domain: string;
  distribution: Record<string, number>; // state -> percentage of cohort (0-100)
  sampleSize: number; // students with ANY evidence for this skill
  cohortSize: number; // total students in the roster
}

const STATES = ['UNKNOWN', 'DEVELOPING', 'STRONG', 'MASTERED', 'MAINTENANCE'];

/**
 * Section 47: aggregated cohort intelligence, e.g. "Probability: Strong 31%,
 * Developing 42%, Weak 27%". Only ever returns percentages/counts — never a
 * per-student breakdown (section 62 privacy: aggregate view only).
 */
export async function getCohortSkillDistribution(institutionId: string, domain?: string): Promise<CohortSkillDistribution[]> {
  const studentIds = await adapters.roster.getStudentIdsForInstitution(institutionId);
  if (studentIds.length === 0) return [];

  const snapshot = await loadGraphSnapshot('PUBLISHED');
  const skillNodes = snapshot.nodes.filter((n) => (n.level === 'SKILL' || n.level === 'SUBSKILL') && (!domain || n.domain === domain));

  const results: CohortSkillDistribution[] = [];
  for (const node of skillNodes) {
    const states = await studentStateRepository.findBySkillForStudents(node.id, studentIds);
    const counts: Record<string, number> = Object.fromEntries(STATES.map((s) => [s, 0]));
    for (const s of states) counts[s.state] = (counts[s.state] ?? 0) + 1;
    // Students with zero rows are implicitly UNKNOWN too.
    counts.UNKNOWN += studentIds.length - states.length;

    const distribution: Record<string, number> = {};
    for (const state of STATES) {
      distribution[state] = studentIds.length > 0 ? Math.round((counts[state] / studentIds.length) * 100) : 0;
    }

    results.push({
      skillCode: node.code,
      displayName: node.displayName,
      domain: node.domain,
      distribution,
      sampleSize: states.length,
      cohortSize: studentIds.length,
    });
  }
  return results;
}

/**
 * Section 48: flags a chain of PREREQUISITE-linked skills where the cohort
 * is disproportionately weak across all of them — a candidate "weakness
 * cluster" for the intervention system to look at (section 49). Feature 45
 * only surfaces the signal; it does not run interventions.
 */
export function findWeaknessClusters(distributions: CohortSkillDistribution[], weakThresholdPct = 40): Array<{ skillCodes: string[]; note: string }> {
  const weakSkills = distributions.filter((d) => d.distribution.DEVELOPING + d.distribution.UNKNOWN >= weakThresholdPct);
  if (weakSkills.length < 2) return [];
  return [
    {
      skillCodes: weakSkills.map((s) => s.skillCode),
      note: `${weakSkills.length} skills each show ${weakThresholdPct}%+ of the cohort as developing or unevaluated — worth a closer look as a possible cluster rather than isolated topics.`,
    },
  ];
}
