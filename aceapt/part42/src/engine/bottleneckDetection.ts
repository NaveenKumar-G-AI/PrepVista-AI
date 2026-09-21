import type { Blueprint, BottleneckSignal, SkillEstimate } from "../types/domain.js";
import { children, nodeById } from "./blueprint.js";

const WEAK_STATUSES = new Set(["needs_focus", "developing"]);

/**
 * Two modes, and they should not be confused with each other:
 *
 * 1. Real prerequisite graph (preferred): if the caller supplies actual
 *    prerequisite edges — derived from question-level `prerequisite_of`
 *    metadata (Module 3) or wherever ACEAPT's real curriculum graph lives —
 *    this checks whether a weak skill's declared prerequisites are also
 *    weak, and only then calls it a possible bottleneck.
 *
 * 2. Sibling-weakness fallback: no real prerequisite data was reachable
 *    this session (see TRUTH_TABLE.md), so when no graph is supplied this
 *    falls back to a much weaker heuristic — "multiple sibling skills under
 *    the same subtopic/topic are all weak" — and flags the shared PARENT
 *    node, using the spec's own hedge language ("possible foundational
 *    bottleneck") precisely because this heuristic cannot establish
 *    causality. Do not read mode 2's output with the same confidence as
 *    mode 1's.
 */
export function detectBottlenecks(
  blueprint: Blueprint,
  estimatesBySkillId: Map<string, SkillEstimate>,
  prerequisiteGraph?: Map<string, string[]>, // skillNodeId -> prerequisite skillNodeIds
): BottleneckSignal[] {
  if (prerequisiteGraph) {
    return detectViaPrerequisiteGraph(estimatesBySkillId, prerequisiteGraph);
  }
  return detectViaSiblingWeaknessHeuristic(blueprint, estimatesBySkillId);
}

function detectViaPrerequisiteGraph(
  estimatesBySkillId: Map<string, SkillEstimate>,
  prerequisiteGraph: Map<string, string[]>,
): BottleneckSignal[] {
  const signals: BottleneckSignal[] = [];

  for (const [skillId, prereqIds] of prerequisiteGraph.entries()) {
    const skillEstimate = estimatesBySkillId.get(skillId);
    if (!skillEstimate || !WEAK_STATUSES.has(skillEstimate.status)) continue;
    if (skillEstimate.confidenceState === "incomplete") continue;

    const weakPrereqs = prereqIds.filter((pid) => {
      const est = estimatesBySkillId.get(pid);
      return est && WEAK_STATUSES.has(est.status) && est.confidenceState !== "incomplete";
    });

    if (weakPrereqs.length > 0 && weakPrereqs.length === prereqIds.length) {
      signals.push({
        skillNodeId: weakPrereqs[0]!,
        possibleBottleneckOf: [skillId],
        note: `Evidence suggests this foundational skill may be contributing to weaker performance on ${skillEstimate.nodeLabel}.`,
      });
    }
  }

  return signals;
}

function detectViaSiblingWeaknessHeuristic(
  blueprint: Blueprint,
  estimatesBySkillId: Map<string, SkillEstimate>,
): BottleneckSignal[] {
  const signals: BottleneckSignal[] = [];
  const subtopics = blueprint.nodes.filter((n) => n.level === "subtopic");

  for (const subtopic of subtopics) {
    const skillChildren = children(blueprint, subtopic.id);
    if (skillChildren.length < 2) continue;

    const withEvidence = skillChildren
      .map((c) => estimatesBySkillId.get(c.id))
      .filter((e): e is SkillEstimate => !!e && e.confidenceState !== "incomplete");

    if (withEvidence.length < 2) continue;

    const allWeak = withEvidence.every((e) => WEAK_STATUSES.has(e.status));
    if (allWeak) {
      const parent = nodeById(blueprint, subtopic.parentNodeId ?? "");
      signals.push({
        skillNodeId: subtopic.id,
        possibleBottleneckOf: withEvidence.map((e) => e.skillNodeId),
        note:
          `Possible foundational bottleneck: every measured skill under ${subtopic.label}` +
          (parent ? ` (within ${parent.label})` : "") +
          " is currently weak. This is a pattern worth investigating, not a confirmed cause.",
      });
    }
  }

  return signals;
}
