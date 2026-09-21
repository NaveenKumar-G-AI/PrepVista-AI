import type { Importance, RoleDetail, TechnologyUsage } from './types.js';

export interface ComparisonRow<TValue> {
  slug: string;
  name: string;
  a: TValue | null;
  b: TValue | null;
  shared: boolean;
}

export interface RoleComparison {
  roleA: { slug: string; name: string };
  roleB: { slug: string; name: string };
  competencies: ComparisonRow<{ importance: Importance }>[];
  technologies: ComparisonRow<{ usageType: TechnologyUsage }>[];
}

/**
 * Builds a side-by-side comparison purely from each role's existing
 * mappings — never hand-authored per role pair (Step 30: "Never create
 * separate hardcoded comparison content").
 */
export function compareRoles(a: RoleDetail, b: RoleDetail): RoleComparison {
  const competencySlugs = new Set([
    ...a.competencies.map((c) => c.competency.slug),
    ...b.competencies.map((c) => c.competency.slug),
  ]);

  const competencies: RoleComparison['competencies'] = [...competencySlugs]
    .map((slug) => {
      const inA = a.competencies.find((c) => c.competency.slug === slug) ?? null;
      const inB = b.competencies.find((c) => c.competency.slug === slug) ?? null;
      const name = (inA ?? inB)!.competency.name;
      return {
        slug,
        name,
        a: inA ? { importance: inA.importance } : null,
        b: inB ? { importance: inB.importance } : null,
        shared: Boolean(inA && inB),
      };
    })
    .sort((x, y) => Number(y.shared) - Number(x.shared) || x.name.localeCompare(y.name));

  const technologySlugs = new Set([
    ...a.technologies.map((t) => t.technology.slug),
    ...b.technologies.map((t) => t.technology.slug),
  ]);

  const technologies: RoleComparison['technologies'] = [...technologySlugs]
    .map((slug) => {
      const inA = a.technologies.find((t) => t.technology.slug === slug) ?? null;
      const inB = b.technologies.find((t) => t.technology.slug === slug) ?? null;
      const name = (inA ?? inB)!.technology.name;
      return {
        slug,
        name,
        a: inA ? { usageType: inA.usageType } : null,
        b: inB ? { usageType: inB.usageType } : null,
        shared: Boolean(inA && inB),
      };
    })
    .sort((x, y) => Number(y.shared) - Number(x.shared) || x.name.localeCompare(y.name));

  return {
    roleA: { slug: a.slug, name: a.name },
    roleB: { slug: b.slug, name: b.name },
    competencies,
    technologies,
  };
}
