import { randomUUID } from "node:crypto";
import type {
  ActionDecision,
  Diagnosis,
  InterventionRecord,
  LearningEventRecord,
  NodeStatus,
  PathNode,
  PathVersion,
  SkillEvidenceRecord,
  StudentContext,
  StuckSignal,
} from "./types.js";
import { emptyEvidence, HIGH_IMPACT_RELEVANCE_THRESHOLD, URGENT_DEADLINE_DAYS } from "./types.js";
import type { SkillGraph } from "./skillGraph.js";
import { diagnoseSkill, overallSkillLevel } from "./evidence.js";
import { computePriority, goalRelevanceOf, urgencyFromDeadline } from "./priorityEngine.js";
import { decideNextBestAction } from "./nextBestActionEngine.js";
import { detectStuck, countAbandonments, type AttemptSignal } from "./stuckDetection.js";

export interface PathGenerationInput {
  context: StudentContext;
  graph: SkillGraph;
  evidenceMap: Map<string, SkillEvidenceRecord>;
  priorVersion: PathVersion | null;
  priorInterventionsBySkill: Map<string, InterventionRecord[]>;
  recentAttemptsBySkill: Map<string, AttemptSignal[]>;
  events: LearningEventRecord[];
  nextVersionNumber: number;
  now?: Date;
}

function nodeStatusFor(diagnosis: Diagnosis, evidence: SkillEvidenceRecord): NodeStatus {
  if (diagnosis.primaryGap === "NONE") return "VERIFIED";
  if (diagnosis.primaryGap === "STALE") return "REVIEW_DUE";
  if (evidence.foundation.attempts > 0 || evidence.application.attempts > 0) return "IN_PROGRESS";
  return "UPCOMING";
}

/**
 * Phase 26: if a candidate skill isn't ready, walk its prerequisite chain
 * until reaching a skill with no unmet prerequisite of its own — that's the
 * actual next actionable step. A single hop is not enough: e.g. Discount is
 * blocked by Profit & Loss, which is itself blocked by Percentage
 * Application — stopping at Profit & Loss would produce a node labeled
 * "Profit & Loss" whose decided action actually targets Percentage
 * Application (caught via the seeded demo run — see TRUTH_TABLE.md).
 */
export function resolveToActionableSkill(startId: string, graph: SkillGraph, evidenceMap: Map<string, SkillEvidenceRecord>): string {
  let current = startId;
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    const readiness = graph.computeReadiness(current, evidenceMap);
    if (readiness.isReady || !readiness.blockingPrerequisiteId) return current;
    current = readiness.blockingPrerequisiteId;
  }
  return current; // defensive: only reachable if sanitizeCycles somehow missed a cycle
}

function resolveBlocking(candidateSkillIds: string[], graph: SkillGraph, evidenceMap: Map<string, SkillEvidenceRecord>): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const id of candidateSkillIds) {
    const target = resolveToActionableSkill(id, graph, evidenceMap);
    if (!seen.has(target)) {
      seen.add(target);
      resolved.push(target);
    }
  }
  return resolved;
}

function diffReason(prior: PathVersion | null, candidateSkillIds: string[]): { reason: string; triggeringEvidence: string[] } {
  if (!prior) {
    return { reason: "Initial path generated from current skill evidence.", triggeringEvidence: [] };
  }
  const priorOrder = prior.nodes.map((n) => n.skillId);
  const newlyAdvanced = priorOrder.filter((id) => !candidateSkillIds.includes(id));
  const newlyAppeared = candidateSkillIds.filter((id) => !priorOrder.includes(id));

  if (newlyAdvanced.length === 0 && newlyAppeared.length === 0) {
    return { reason: "No meaningful evidence change since the last path — order unchanged.", triggeringEvidence: [] };
  }
  const parts: string[] = [];
  if (newlyAdvanced.length) parts.push(`${newlyAdvanced.join(", ")} moved out of active focus (verified or deferred)`);
  if (newlyAppeared.length) parts.push(`${newlyAppeared.join(", ")} entered focus based on new evidence`);
  return { reason: parts.join("; "), triggeringEvidence: [...newlyAdvanced, ...newlyAppeared] };
}

export function generatePath(input: PathGenerationInput): PathVersion {
  const { context, graph, evidenceMap, priorVersion, priorInterventionsBySkill, recentAttemptsBySkill, events, nextVersionNumber } = input;
  const now = input.now ?? new Date();

  // 1. Diagnose every skill; a candidate is anything not already fully mastered.
  const diagnoses = new Map<string, Diagnosis>();
  for (const skill of graph.all()) {
    const evidence = evidenceMap.get(skill.id) ?? emptyEvidence(context.studentId, skill.id);
    diagnoses.set(skill.id, diagnoseSkill(evidence));
  }
  let candidateIds = graph.all().filter((s) => diagnoses.get(s.id)!.primaryGap !== "NONE").map((s) => s.id);

  // 2. Prerequisite-aware substitution (Phase 26).
  candidateIds = resolveBlocking(candidateIds, graph, evidenceMap);

  // 3. Score every candidate.
  const urgency = urgencyFromDeadline(context.deadline, now);
  const isUrgent = context.deadline ? (new Date(context.deadline).getTime() - now.getTime()) / 86_400_000 <= URGENT_DEADLINE_DAYS : false;

  let scored = candidateIds.map((id) => {
    const skill = graph.skills.get(id)!;
    const evidence = evidenceMap.get(id) ?? emptyEvidence(context.studentId, id);
    const diagnosis = diagnoses.get(id)!;
    const readiness = graph.computeReadiness(id, evidenceMap);
    const stuck = detectStuck(recentAttemptsBySkill.get(id) ?? [], countAbandonments(events, id));
    const action = decideNextBestAction({
      skillId: id,
      diagnosis,
      evidence,
      readiness,
      stuck,
      priorInterventionsForSkill: priorInterventionsBySkill.get(id) ?? [],
      hasUnexploredDownstream: graph.dependentsOf(id).length > 0,
    });
    const priority = computePriority(skill, diagnosis, action.actionType, context, graph, !readiness.isReady);
    return { skill, evidence, diagnosis, action, priority, stuck };
  });

  // 4. Phase 29-30 — under a tight deadline, filter to high-impact + relevant
  //    + verification-quick-wins only, and always surface the tradeoff
  //    explicitly (even when nothing ends up filtered — e.g. a single
  //    candidate — the framing is still true and still worth saying).
  let tradeoffMessage: string | null = null;
  if (isUrgent && scored.length > 0) {
    if (scored.length > 1) {
      const highImpact = scored.filter(
        (s) => goalRelevanceOf(s.skill, context) >= HIGH_IMPACT_RELEVANCE_THRESHOLD || s.action.actionType === "REVIEW" || s.priority.factors.isBlocking
      );
      if (highImpact.length > 0) scored = highImpact;
    }
    tradeoffMessage =
      "You have limited time before your deadline. ACEAPT is prioritizing high-impact readiness skills now while preserving deeper mastery for your longer-term path.";
  }

  // 5. Sort by score, descending.
  scored.sort((a, b) => b.priority.score - a.priority.score);

  const nodes: PathNode[] = scored.map((s, index) => ({
    skillId: s.skill.id,
    skillName: s.skill.name,
    order: index,
    status: nodeStatusFor(s.diagnosis, s.evidence),
    priorityScore: Math.round(s.priority.score * 1000) / 1000,
    reason: s.action.reason,
    estimatedMinutes: s.skill.estimatedLearnMinutes,
    action: s.action satisfies ActionDecision,
  }));

  const { reason, triggeringEvidence } = diffReason(priorVersion, candidateIds);

  return {
    // This id (and versionNumber below) are the generator's best-effort
    // guess — under concurrent regeneration, Store.savePathVersion assigns
    // the true version number atomically and returns the authoritative
    // version; callers must use that return value, not this one, as the
    // persisted source of truth (see migrations/003_atomic_version_numbering.sql).
    id: `pv_${randomUUID()}`,
    studentId: context.studentId,
    versionNumber: nextVersionNumber,
    reason,
    triggeringEvidence,
    tradeoffMessage,
    nodes,
    createdAt: now.toISOString(),
  };
}

export { overallSkillLevel };
