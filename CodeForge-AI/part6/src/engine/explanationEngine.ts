import type { RoadmapSkill } from '../domain/types';

/**
 * Every sentence here is templated from fields already computed by the
 * priority/gap engines — nothing is invented. This is deliberately NOT an
 * LLM call: Phase 36 requires explanations to reference real evidence, and
 * grounding them in structured facts is the only way to guarantee that.
 * (An optional AI polish pass can rephrase this text — see src/ai/provider.ts
 * — but it validates against these same facts and falls back to this exact
 * string if it can't.)
 */
export function explainRoadmapSkill(skill: RoadmapSkill, unlocksSkillNames: string[]): string {
  const parts = [explainGap(skill)];
  if (skill.insertedReason) parts.push(skill.insertedReason);
  if (unlocksSkillNames.length > 0) parts.push(`Resolving this unlocks: ${unlocksSkillNames.join(', ')}.`);
  parts.push(explainPriority(skill));
  return parts.join(' ');
}

function explainGap(skill: RoadmapSkill): string {
  switch (skill.gapStatus) {
    case 'UNKNOWN':
      return `${skill.skillName} has no recorded evidence yet, so it's flagged for assessment rather than assumed weak.`;
    case 'CRITICAL_GAP':
      return `Recent evidence puts ${skill.skillName} well below the ${skill.targetMastery} level this path needs.`;
    case 'GAP':
      return `${skill.skillName} is below the ${skill.targetMastery} target this path requires.`;
    case 'DEVELOPING':
      return `${skill.skillName} is close to ${skill.targetMastery} — this should consolidate it.`;
    case 'INSUFFICIENT_EVIDENCE':
      return `${skill.skillName} looks fine on paper but rests on too little independent evidence to trust yet.`;
    case 'BLOCKED':
      return `${skill.skillName} is on hold until its prerequisite is solid.`;
    default:
      return `${skill.skillName} is being maintained at ${skill.targetMastery}.`;
  }
}

function explainPriority(skill: RoadmapSkill): string {
  const b = skill.priorityBreakdown;
  const drivers = [
    { label: 'role importance', c: b.role.contribution },
    { label: 'gap severity', c: b.gap.contribution },
    { label: 'how much it blocks downstream skills', c: b.block.contribution },
    { label: 'being a required skill', c: b.required.contribution },
    { label: 'deadline urgency', c: b.urgency.contribution },
    { label: 'a recent declining trend', c: b.trend.contribution },
  ]
    .sort((a, c) => c.c - a.c)
    .filter((d) => d.c > 0);
  if (drivers.length === 0) return `Priority score: ${skill.priorityScore.toFixed(2)}.`;
  const top = drivers
    .slice(0, 2)
    .map((d) => d.label)
    .join(' and ');
  return `Priority score ${skill.priorityScore.toFixed(2)} / 1.0, driven mainly by ${top}.`;
}

export function explainReadinessGate(unmetReasons: string[]): string {
  if (unmetReasons.length === 0) return 'All readiness gate conditions are currently met.';
  return `Not yet, because: ${unmetReasons.join('; ')}.`;
}
