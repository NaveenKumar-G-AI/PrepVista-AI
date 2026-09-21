/**
 * CodeForge — Skill-Gap Analysis (§12)
 *
 * Turns "Python Strong, Arrays Strong, Hashing Developing, Debugging Weak,
 * Algorithms Developing" into a priority-ordered target list — the input
 * challengeSelector.ts needs to answer "what's the priority gap, and what's
 * secondary" rather than reaching for another random challenge on a skill
 * the student already has.
 */

import { SKILL_LEVEL_ORDER, SkillLevel, type MisconceptionRecord, type MistakeCategory, type SkillEvidenceEvent, type StudentProfile } from "../domain/types.js";
import { allSkills } from "../domain/skillTaxonomy.js";

export interface SkillGap {
  skill: string;
  level: SkillLevel;
  /** 0 (no gap) – ~1.3 (urgent gap, reinforced by an active misconception). */
  gapScore: number;
  evidenceCount: number;
  recentMistakes: MistakeCategory[];
  hasActiveMisconception: boolean;
}

/** WEAK -> 1.0, DEVELOPING -> ~0.67, PROFICIENT -> ~0.33, STRONG -> 0.0 */
function levelUrgency(level: SkillLevel): number {
  const idx = SKILL_LEVEL_ORDER.indexOf(level);
  return (SKILL_LEVEL_ORDER.length - 1 - idx) / (SKILL_LEVEL_ORDER.length - 1);
}

export function analyzeSkillGaps(profile: StudentProfile, misconceptions: MisconceptionRecord[] = []): SkillGap[] {
  const gaps: SkillGap[] = [];

  for (const [skillKey, state] of Object.entries(profile.skills)) {
    const recentMistakes = state.evidence.slice(0, 5).flatMap((e) => e.mistakeCategories);
    const activeForSkill = misconceptions.filter((m) => m.studentId === profile.studentId && m.skill === skillKey && m.occurrences >= 2);
    const gapScore = levelUrgency(state.level) + (activeForSkill.length > 0 ? 0.3 : 0);
    gaps.push({
      skill: skillKey,
      level: state.level,
      gapScore,
      evidenceCount: state.evidence.length,
      recentMistakes,
      hasActiveMisconception: activeForSkill.length > 0,
    });
  }

  // Skills in the taxonomy with no evidence yet are exploration-worthy (real evidence value, §11)
  // but shouldn't outrank a confirmed, actively-struggling skill — moderate fixed priority.
  for (const node of allSkills()) {
    if (!(node.key in profile.skills)) {
      gaps.push({ skill: node.key, level: SkillLevel.WEAK, gapScore: 0.55, evidenceCount: 0, recentMistakes: [], hasActiveMisconception: false });
    }
  }

  return gaps.sort((a, b) => b.gapScore - a.gapScore);
}

/**
 * Deliberately simple evidence-count heuristic for the prototype: three
 * consecutive hint-free passes promotes a level, two consecutive failures
 * demotes one. A production system would likely graduate to Bayesian
 * Knowledge Tracing or an IRT-style model — see docs/CODEFORGE_RESEARCH.md —
 * but this is real, evidence-driven, and auditable rather than a placeholder.
 */
export function recomputeSkillLevel(currentLevel: SkillLevel, evidence: SkillEvidenceEvent[]): SkillLevel {
  const idx = SKILL_LEVEL_ORDER.indexOf(currentLevel);
  const lastThree = evidence.slice(0, 3);
  const lastTwo = evidence.slice(0, 2);

  if (lastThree.length === 3 && lastThree.every((e) => e.outcome === "PASSED" && e.hintsUsed === 0)) {
    return SKILL_LEVEL_ORDER[Math.min(SKILL_LEVEL_ORDER.length - 1, idx + 1)]!;
  }
  if (lastTwo.length === 2 && lastTwo.every((e) => e.outcome === "FAILED")) {
    return SKILL_LEVEL_ORDER[Math.max(0, idx - 1)]!;
  }
  return currentLevel;
}
