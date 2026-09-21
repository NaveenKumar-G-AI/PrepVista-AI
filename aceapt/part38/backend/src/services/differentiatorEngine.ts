import { Capability, Differentiator, ProjectEvidence } from "../types/domain";
import { normalize } from "./relevanceEngine";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  backend: ["python", "fastapi", "django", "flask", "sql", "postgresql", "mysql", "rest api", "node.js", "express", "java", "go"],
  ai: ["machine learning", "ml", "rag", "tensorflow", "pytorch", "computer vision", "llm", "nlp", "deep learning"],
  frontend: ["react", "vue", "angular", "frontend", "css", "html", "typescript", "javascript"],
};

function categoryOf(name: string): string | null {
  const n = normalize(name);
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.includes(n)) return category;
  }
  return null;
}

function describeCombination(categories: string[]): string {
  const set = new Set(categories);
  if (set.has("ai") && set.has("backend")) return "AI-integrated backend systems";
  if (set.has("frontend") && set.has("backend")) return "full-stack systems spanning frontend and backend";
  if (set.has("ai") && set.has("frontend")) return "AI-integrated frontend experiences";
  return `${categories.join(" and ")} systems`;
}

/**
 * A differentiator must be relevant, demonstrated, and defensible (spec
 * section 36) — never manufactured (section 35). The only signal used here:
 * a validated project whose technologies span more than one of the
 * student's own strong (validated/demonstrated) capability categories. This
 * category dictionary is intentionally small; replace it with a real
 * taxonomy from Feature 37 when one exists.
 */
export function detectDifferentiators(capabilities: Capability[], projects: ProjectEvidence[]): Differentiator[] {
  const strongCategories = new Set(
    capabilities
      .filter((c) => c.evidenceStrength === "validated" || c.evidenceStrength === "demonstrated")
      .map((c) => categoryOf(c.name))
      .filter((c): c is string => c !== null)
  );

  if (strongCategories.size < 2) return [];

  const combiningProject = projects.find((project) => {
    if (!project.validated) return false;
    const projectCategories = new Set(project.technologies.map(categoryOf).filter((c): c is string => c !== null));
    return [...strongCategories].filter((c) => projectCategories.has(c)).length >= 2;
  });

  if (!combiningProject) return [];

  const involvedCategories = [...strongCategories].filter((c) =>
    combiningProject.technologies.map(categoryOf).includes(c)
  );

  const supportingEvidenceIds = [
    combiningProject.id,
    ...capabilities.filter((c) => involvedCategories.includes(categoryOf(c.name) ?? "")).map((c) => c.id),
  ];

  return [{ description: describeCombination(involvedCategories), supportingEvidenceIds }];
}
