/**
 * CodeForge — Skill Taxonomy (§7)
 *
 * A skill key is "<domain>.<skill>", e.g. "data_structures.hashing". Subskills
 * are finer-grained labels a Challenge attaches on top of a skill key (e.g.
 * "duplicate_detection" under data_structures.hashing) — they are intentionally
 * free-form strings rather than a closed enum, so new ones can be introduced by
 * challenge authors without a schema migration (§7: "must support adding
 * additional domains later").
 *
 * This seed covers four domains at a representative (not exhaustive) depth —
 * enough for the selection engine to make real prerequisite/gap decisions.
 * Extending it is additive: add a SkillNode, nothing else needs to change.
 */

import type { StudentSkillState } from "../domain/types.js";
import { SKILL_LEVEL_ORDER, SkillLevel } from "../domain/types.js";

export interface SkillNode {
  key: string;
  domain: string;
  name: string;
  label: string;
  description: string;
  /** Skill keys foundational to this one. Informational + used for default gating suggestions. */
  prerequisites: string[];
}

function skill(
  domain: string,
  name: string,
  label: string,
  description: string,
  prerequisites: string[] = [],
): [string, SkillNode] {
  const key = `${domain}.${name}`;
  return [key, { key, domain, name, label, description, prerequisites }];
}

export const SKILL_TAXONOMY: Record<string, SkillNode> = Object.fromEntries([
  // --- fundamentals ---------------------------------------------------
  skill("fundamentals", "control_flow", "Control Flow", "Conditionals, loops, and branching logic."),
  skill("fundamentals", "functions", "Functions", "Decomposition, parameters, return values, scope."),
  skill(
    "fundamentals",
    "recursion",
    "Recursion",
    "Base cases, recursive cases, call-stack reasoning.",
    ["fundamentals.functions"],
  ),

  // --- data structures -------------------------------------------------
  skill("data_structures", "arrays", "Arrays", "Indexing, iteration, in-place manipulation."),
  skill("data_structures", "strings", "Strings", "Traversal, parsing, immutability-aware manipulation.", [
    "data_structures.arrays",
  ]),
  skill(
    "data_structures",
    "hashing",
    "Hash Maps & Sets",
    "Amortized O(1) lookup structures; collision and key-design reasoning.",
    ["data_structures.arrays"],
  ),
  skill("data_structures", "linked_lists", "Linked Lists", "Pointer manipulation, traversal, cycle detection."),
  skill("data_structures", "trees", "Trees", "Hierarchical traversal and recursive structure reasoning.", [
    "fundamentals.recursion",
  ]),
  skill("data_structures", "graphs", "Graphs", "Adjacency modeling, traversal, connectivity.", [
    "data_structures.trees",
  ]),

  // --- algorithms --------------------------------------------------------
  skill("algorithms", "sorting", "Sorting", "Comparison-based and non-comparison sorting strategies."),
  skill("algorithms", "searching", "Searching", "Linear and binary search over ordered/unordered data.", [
    "data_structures.arrays",
  ]),
  skill(
    "algorithms",
    "two_pointers",
    "Two Pointers",
    "Coordinated index movement over linear structures.",
    ["data_structures.arrays"],
  ),
  skill(
    "algorithms",
    "sliding_window",
    "Sliding Window",
    "Maintaining a running window over a sequence for O(n) scans.",
    ["algorithms.two_pointers"],
  ),
  skill(
    "algorithms",
    "dynamic_programming",
    "Dynamic Programming",
    "Overlapping subproblems, memoization, and tabulation.",
    ["fundamentals.recursion"],
  ),
  skill(
    "algorithms",
    "graph_algorithms",
    "Graph Algorithms",
    "BFS/DFS, shortest paths, connectivity algorithms.",
    ["data_structures.graphs"],
  ),

  // --- engineering ---------------------------------------------------------
  skill(
    "engineering",
    "debugging",
    "Debugging",
    "Locating and correcting defects in existing code from symptoms/tests.",
    ["fundamentals.functions"],
  ),
  skill("engineering", "testing", "Testing", "Writing tests that meaningfully cover behavior and edge cases."),
  skill(
    "engineering",
    "validation",
    "Input Validation",
    "Defensive handling of malformed, missing, or adversarial input.",
    ["fundamentals.control_flow"],
  ),
  skill(
    "engineering",
    "api_development",
    "API Development",
    "Request/response contracts, status codes, request/response shaping.",
    ["engineering.validation"],
  ),
  skill("engineering", "error_handling", "Error Handling", "Anticipating, raising, and recovering from failure."),
  skill(
    "engineering",
    "performance",
    "Performance",
    "Complexity reasoning and optimization under constraints.",
    ["algorithms.sorting"],
  ),
]);

export function getSkill(key: string): SkillNode | undefined {
  return SKILL_TAXONOMY[key];
}

export function allSkills(): SkillNode[] {
  return Object.values(SKILL_TAXONOMY);
}

export function skillsByDomain(domain: string): SkillNode[] {
  return allSkills().filter((s) => s.domain === domain);
}

export function skillLabel(key: string): string {
  return SKILL_TAXONOMY[key]?.label ?? key;
}

/** True when the student is at or above `minLevel` on `skillKey` (defaults to PROFICIENT). */
export function meetsSkillLevel(
  skills: Record<string, StudentSkillState>,
  skillKey: string,
  minLevel: SkillLevel = SkillLevel.PROFICIENT,
): boolean {
  const state = skills[skillKey];
  if (!state) return false;
  return SKILL_LEVEL_ORDER.indexOf(state.level) >= SKILL_LEVEL_ORDER.indexOf(minLevel);
}

/** Which of a challenge's declared prerequisites the student does NOT yet meet. */
export function unmetPrerequisites(
  skills: Record<string, StudentSkillState>,
  prerequisites: string[],
): string[] {
  return prerequisites.filter((p) => !meetsSkillLevel(skills, p));
}
