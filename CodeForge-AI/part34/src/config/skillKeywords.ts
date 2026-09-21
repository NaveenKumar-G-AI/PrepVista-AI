// ============================================================================
// Keyword hints used only by the deterministic skill-relevance check in
// questionValidation.ts. This is NOT the skill catalog — the real skill
// catalog lives in the existing Role-Based Skill Model (Phase 5) and is
// reached through RoleRequirementsPort. Wire getSkillKeywords() to pull
// tags/aliases from that catalog when integrating; the fallback here (derive
// from the skill id itself) keeps validation working even for skills with no
// configured keyword list.
// ============================================================================

const SKILL_KEYWORDS: Record<string, string[]> = {
  skill_python: ["python", "list", "dict", "generator", "decorator", "gil", "async"],
  skill_sql: ["sql", "query", "index", "join", "database", "table", "schema", "transaction"],
  skill_system_design: ["design", "scale", "scalability", "architecture", "component", "latency", "throughput", "availability"],
  skill_debugging: ["debug", "bug", "error", "trace", "log", "root cause", "symptom", "fix"],
  skill_rest_apis: ["api", "endpoint", "rest", "http", "request", "response", "route", "auth"],
  skill_testing: ["test", "unit test", "assert", "mock", "coverage", "integration test"],
};

export function getSkillKeywords(skillId: string): string[] {
  const configured = SKILL_KEYWORDS[skillId];
  if (configured && configured.length > 0) return configured;

  // Fallback: turn "skill_some_thing" into ["some", "thing"] so an
  // unconfigured skill still gets a plausible relevance check instead of
  // always failing it.
  return skillId
    .replace(/^skill_/, "")
    .split(/[_\-\s]+/)
    .filter((token) => token.length > 2);
}
