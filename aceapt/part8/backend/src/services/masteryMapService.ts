import type { PoolClient } from "pg";
import { listSkills } from "../repositories/skillRepository.js";
import { listMasteryStatesForStudent } from "../repositories/masteryStateRepository.js";
import type { MasteryStateEnum } from "../types/index.js";

export interface MasteryMapEntry {
  skillId: string;
  skillKey: string;
  skillName: string;
  category: string;
  state: MasteryStateEnum;
  confidence: string | null;
  lastVerifiedAt: string | null;
  nextReviewAt: string | null;
}

export interface MasteryMap {
  categories: Array<{ category: string; skills: MasteryMapEntry[] }>;
}

/**
 * Spec section 37: a student-facing map that reflects actual evidence, never
 * a fabricated state. Skills the student hasn't touched yet still appear
 * (as UNKNOWN) rather than being hidden, so the map is honest about what
 * hasn't been attempted rather than only showing progress.
 */
export async function buildMasteryMap(client: PoolClient, studentId: string): Promise<MasteryMap> {
  const skills = await listSkills(client);
  const states = await listMasteryStatesForStudent(client, studentId);
  const stateBySkill = new Map(states.map((s) => [s.skillId, s]));

  const byCategory = new Map<string, MasteryMapEntry[]>();
  for (const skill of skills) {
    const state = stateBySkill.get(skill.id);
    const entry: MasteryMapEntry = {
      skillId: skill.id,
      skillKey: skill.key,
      skillName: skill.name,
      category: skill.category,
      state: state?.state ?? "UNKNOWN",
      confidence: state?.confidence ?? null,
      lastVerifiedAt: state?.lastVerifiedAt ?? null,
      nextReviewAt: state?.nextReviewAt ?? null,
    };
    const list = byCategory.get(skill.category) ?? [];
    list.push(entry);
    byCategory.set(skill.category, list);
  }

  return {
    categories: Array.from(byCategory.entries()).map(([category, skillsList]) => ({ category, skills: skillsList })),
  };
}
