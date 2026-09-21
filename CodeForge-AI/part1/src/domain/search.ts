// Deterministic search ranking. A plain database/string-match search does
// not need an LLM (Step 27 is explicit about this) — this module is pure
// and unit-testable in isolation from the database.

export interface SearchableRole {
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  familyName: string;
  competencyNames: string[];
  technologyNames: string[];
}

export interface SearchResult {
  slug: string;
  score: number;
  matchedOn: string;
}

const WEIGHTS = {
  exactName: 100,
  exactSlug: 95,
  nameStartsWith: 80,
  nameContains: 60,
  familyContains: 45,
  competencyContains: 35,
  technologyContains: 30,
  descriptionContains: 15,
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Ranks roles against a query using tiered, deterministic string matching.
 * Ties break alphabetically by name so results are stable across runs.
 */
export function searchRoles(roles: SearchableRole[], query: string): SearchResult[] {
  const q = norm(query);
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const role of roles) {
    const name = norm(role.name);
    const slug = norm(role.slug);
    let best: { score: number; matchedOn: string } | null = null;

    const consider = (score: number, matchedOn: string) => {
      if (!best || score > best.score) best = { score, matchedOn };
    };

    if (name === q) consider(WEIGHTS.exactName, 'name');
    if (slug === q || slug === q.replace(/\s+/g, '-')) consider(WEIGHTS.exactSlug, 'slug');
    if (name.startsWith(q)) consider(WEIGHTS.nameStartsWith, 'name');
    if (name.includes(q)) consider(WEIGHTS.nameContains, 'name');
    if (norm(role.familyName).includes(q)) consider(WEIGHTS.familyContains, 'family');
    if (role.competencyNames.some((c) => norm(c).includes(q))) {
      consider(WEIGHTS.competencyContains, 'competency');
    }
    if (role.technologyNames.some((t) => norm(t).includes(q))) {
      consider(WEIGHTS.technologyContains, 'technology');
    }
    if (norm(role.shortDescription).includes(q) || norm(role.longDescription).includes(q)) {
      consider(WEIGHTS.descriptionContains, 'description');
    }

    if (best) results.push({ slug: role.slug, score: (best as { score: number }).score, matchedOn: (best as { matchedOn: string }).matchedOn });
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.slug.localeCompare(b.slug);
  });
}
