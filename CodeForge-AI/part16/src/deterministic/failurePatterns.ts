import type { TestResult, FailureCluster } from "../domain/types.js";

/**
 * Known tag -> hypothesis mapping. This is intentionally a fixed table, not
 * an LLM call: clustering by shared metadata is a deterministic set
 * operation, and the *hypothesis text* is explicitly worded as a possible
 * explanation, never a proven fact (see FAILURE PATTERN ENGINE requirement).
 */
const TAG_HYPOTHESES: Record<string, string> = {
  boundary: "Possible boundary-handling issue: initialization, off-by-one, or empty/single-element handling.",
  empty: "Possible issue handling empty input (e.g. N = 0).",
  "single-element": "Possible issue handling a single-element input.",
  "large-n": "Possible resource, scaling, or numeric-limit issue on large inputs.",
  "duplicate-values": "Possible incorrect handling of duplicate values or a hidden uniqueness assumption.",
  "negative-values": "Possible sign-handling, initialization, or comparison-assumption issue with negative values.",
  "already-sorted": "Possible assumption that input arrives unsorted.",
  "reverse-sorted": "Possible incorrect comparator direction or ordering assumption.",
  "overflow-boundary": "Possible integer overflow near a numeric boundary.",
  "precision-boundary": "Possible floating-point precision issue.",
  "disconnected-graph": "Possible assumption that the graph is fully connected.",
  cyclic: "Possible missing cycle handling (infinite loop / stack risk).",
  "recursion-boundary": "Possible recursion depth or base-case issue.",
};

/**
 * Clusters failing tests by shared tags. Never receives or exposes raw
 * hidden test inputs — only the non-identifying `tags` metadata that the
 * execution system already attaches to each TestResult.
 */
export function clusterFailures(failing: TestResult[]): FailureCluster[] {
  if (failing.length === 0) return [];

  // Count tag frequency among failing tests only.
  const tagCounts = new Map<string, string[]>(); // tag -> test ids
  for (const t of failing) {
    for (const tag of t.tags) {
      const arr = tagCounts.get(tag) ?? [];
      arr.push(t.id);
      tagCounts.set(tag, arr);
    }
  }

  const clusters: FailureCluster[] = [];
  const claimed = new Set<string>();

  // Prefer larger, more specific clusters first (deterministic ordering by count desc, then tag name).
  const sortedTags = [...tagCounts.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  for (const [tag, testIds] of sortedTags) {
    const unclaimed = testIds.filter((id) => !claimed.has(id));
    if (unclaimed.length === 0) continue;
    // Only cluster when the tag genuinely groups more than one failure, OR
    // it's the only failure and the tag maps to a known hypothesis.
    if (unclaimed.length < 1) continue;

    const hypothesis = TAG_HYPOTHESES[tag] ?? `Possible issue specific to cases tagged "${tag}".`;
    clusters.push({
      id: `cluster-${tag}`,
      testIds: unclaimed,
      sharedTags: [tag],
      hypothesis,
      observedFact: `${unclaimed.length} failing test(s) share the "${tag}" tag.`,
    });
    for (const id of unclaimed) claimed.add(id);
  }

  // Anything left over (no shared tags) becomes its own "ungrouped" cluster —
  // observed as individual facts, no invented shared cause.
  const leftover = failing.filter((t) => !claimed.has(t.id));
  if (leftover.length > 0) {
    clusters.push({
      id: "cluster-ungrouped",
      testIds: leftover.map((t) => t.id),
      sharedTags: [],
      hypothesis: "No shared characteristic was found across these failures; investigate individually.",
      observedFact: `${leftover.length} failing test(s) do not share a common tag with any other failure.`,
    });
  }

  return clusters;
}
