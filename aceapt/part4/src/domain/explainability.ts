import type { ActionDecision, Diagnosis, PriorityScore, Skill, SkillEvidenceRecord, WhyThisExplanation } from "./types.js";
import type { SkillGraph } from "./skillGraph.js";
import { classifyDimension } from "./evidence.js";

function summarizeEvidence(evidence: SkillEvidenceRecord): string {
  const parts: string[] = [];
  const f = classifyDimension(evidence.foundation);
  const a = classifyDimension(evidence.application);
  if (f !== "NONE") parts.push(`foundation: ${evidence.foundation.attempts} attempt(s), ${f.toLowerCase()}`);
  if (a !== "NONE") parts.push(`application: ${evidence.application.attempts} attempt(s), ${a.toLowerCase()}`);
  if (evidence.verifiedAt) parts.push(`last verified ${new Date(evidence.verifiedAt).toISOString().slice(0, 10)}`);
  return parts.length ? parts.join("; ") : "Not enough evidence yet.";
}

const ACTION_NEXT_LABEL: Record<string, string> = {
  LEARN: "Start with the core concept and worked examples.",
  RELEARN: "Rebuild the concept, then re-attempt.",
  PRACTICE: "Targeted application practice.",
  DRILL: "A short, focused drill.",
  REVIEW: "A quick freshness check.",
  TRANSFER: "Practice with unfamiliar variants.",
  SPEED_TRAIN: "Timed practice to build pace.",
  RETEST: "Re-assess to resolve conflicting evidence.",
  ADVANCE: "Move to the next skill.",
  REST: "Nothing scheduled here right now.",
};

export function explain(skill: Skill, evidence: SkillEvidenceRecord, _diagnosis: Diagnosis, priority: PriorityScore, action: ActionDecision, graph: SkillGraph): WhyThisExplanation {
  const downstream = graph.downstreamNames(skill.id);
  const impact =
    downstream.length > 0
      ? `Strengthening this supports ${downstream.join(", ")}.`
      : priority.factors.goalRelevance >= 0.7
      ? "Directly relevant to your stated goal."
      : "A standalone skill in your current path.";

  // action.reason is the single source of truth for "why" — it already
  // resolves to whichever branch actually fired (diagnosis, a stuck-signal
  // override, or a prerequisite-block redirect). Falling back to
  // diagnosis.detail here would silently disagree with the action shown in
  // "next" whenever those diverge — exactly the inconsistency the seeded
  // demo caught (a node reading "application evidence developing" while its
  // action had already been overridden to a stuck-signal RELEARN).
  return {
    what: skill.name,
    why: `Current focus: ${action.reason}`,
    evidence: summarizeEvidence(evidence),
    impact,
    next: ACTION_NEXT_LABEL[action.actionType] ?? action.reason,
  };
}
