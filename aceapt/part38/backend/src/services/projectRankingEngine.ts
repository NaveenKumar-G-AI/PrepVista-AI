import { ProjectEvidence, RankedProject, RoleRequirement } from "../types/domain";
import { normalize } from "./relevanceEngine";

const IMPORTANCE_WEIGHT: Record<RoleRequirement["importance"], number> = {
  core: 3,
  supporting: 2,
  "nice-to-have": 1,
};

/**
 * Ranks projects by contextual relevance: requirement match, validation, and
 * recency (spec section 23). A project that matches nothing in the
 * requirements is excluded rather than padded in at the bottom — "no best
 * project yet" is a real, honest state (spec section 69).
 */
export function rankProjects(
  projects: ProjectEvidence[],
  requirements: RoleRequirement[]
): { best: RankedProject | null; second: RankedProject | null } {
  const scored = projects
    .map((project): RankedProject | null => {
      const reasons: string[] = [];
      let score = 0;

      for (const tech of project.technologies) {
        const requirement = requirements.find((r) => normalize(r.name) === normalize(tech));
        if (requirement) {
          score += IMPORTANCE_WEIGHT[requirement.importance];
          reasons.push(`${tech} matches a ${requirement.importance} requirement for this role`);
        }
      }

      if (score === 0) return null;

      if (project.validated) {
        score += 2;
        reasons.push("Validated project evidence");
      }

      const recencyBonus = Math.max(0, 3 - Math.floor(project.recencyMonthsAgo / 6));
      if (recencyBonus > 0) score += recencyBonus;

      return { project, score, reasons };
    })
    .filter((p): p is RankedProject => p !== null)
    .sort((a, b) => b.score - a.score);

  return { best: scored[0] ?? null, second: scored[1] ?? null };
}
