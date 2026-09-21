import { DEFAULT_PREREQ_TARGET, MAX_SKILLS_PER_MILESTONE } from '../config';
import type {
  ActivityType,
  GapStatus,
  MasteryLevel,
  MasteryState,
  PriorityBreakdown,
  PriorityTier,
  RoleCompetency,
  Skill,
  SkillPrerequisite,
  MilestoneCompletionConditions,
} from '../domain/types';
import { classifyGap, resolveSchedulingStatus } from './gapAnalysis';
import { emptyMasteryState } from './masteryUpdate';
import { computePriority } from './priorityEngine';
import { defaultCompletionConditions } from './milestoneEngine';
import { buildSkillGraph, computeBlockingPower, computeLayers, detectCycle, type SkillGraph } from './prerequisiteGraph';

export interface DraftRoadmapSkill {
  skillId: string;
  skillName: string;
  required: boolean;
  priorityScore: number;
  priorityBreakdown: PriorityBreakdown;
  gapStatus: GapStatus;
  targetMastery: MasteryLevel;
  currentMasterySnapshot: MasteryLevel | null;
  activityType: ActivityType;
  learningObjective: string;
  sequence: number;
  insertedReason: string | null;
}

export interface DraftMilestone {
  sequence: number;
  name: string;
  description: string;
  skills: DraftRoadmapSkill[];
  completionConditions: MilestoneCompletionConditions;
}

export interface GenerationContext {
  studentId: string;
  targetDateISO: string | null;
  allSkills: Skill[];
  allPrerequisites: SkillPrerequisite[];
  roleCompetencies: RoleCompetency[];
  masteryStates: Map<string, MasteryState>;
  now: Date;
}

export interface GenerationResult {
  milestones: DraftMilestone[];
  excludedCycleSkillIds: string[];
}

const PHASE_NAME_BY_CATEGORY: Record<string, string> = {
  Programming: 'Programming Foundations',
  'Data Structures': 'Core Problem Solving',
  Algorithms: 'Algorithmic Reasoning',
  Practice: 'Core Problem Solving',
};

export function generateRoadmapDraft(ctx: GenerationContext): GenerationResult {
  const graph = buildSkillGraph(ctx.allSkills, ctx.allPrerequisites);
  const cycleCheck = detectCycle(graph);
  const excludedCycleSkillIds = cycleCheck.hasCycle ? cycleCheck.cycle ?? [] : [];
  const safeGraph = cycleCheck.hasCycle ? removeSkillsFromGraph(graph, new Set(excludedCycleSkillIds)) : graph;

  const skillTarget = new Map<string, MasteryLevel>();
  const skillRequired = new Map<string, boolean>();
  const skillPriorityTier = new Map<string, PriorityTier>();
  for (const c of ctx.roleCompetencies) {
    skillTarget.set(c.skillId, c.targetMastery);
    skillRequired.set(c.skillId, c.required);
    skillPriorityTier.set(c.skillId, c.priority);
  }

  function effectiveTarget(skillId: string): MasteryLevel {
    return skillTarget.get(skillId) ?? DEFAULT_PREREQ_TARGET;
  }
  function ownGapStatus(skillId: string): GapStatus {
    const state = ctx.masteryStates.get(skillId) ?? emptyMasteryState(ctx.studentId, skillId);
    return classifyGap(state, effectiveTarget(skillId), skillRequired.get(skillId) ?? true);
  }
  function prerequisitesReady(skillId: string): boolean {
    const prereqs = safeGraph.prereqOf.get(skillId) ?? [];
    return prereqs.every((p) => ownGapStatus(p) === 'COMPLETE');
  }

  // Step 1: seed from role competencies that aren't already satisfied.
  const candidateIds = new Set<string>();
  for (const c of ctx.roleCompetencies) {
    if (safeGraph.skills.has(c.skillId) && ownGapStatus(c.skillId) !== 'COMPLETE') candidateIds.add(c.skillId);
  }

  // Step 2: expand transitively through prerequisites that aren't complete.
  // This is what makes "Queue remediation" appear ahead of Graphs/BFS
  // automatically once evidence shows Queues isn't solid — no special-casing.
  const included = new Set<string>();
  function expand(id: string) {
    if (included.has(id) || !safeGraph.skills.has(id)) return;
    included.add(id);
    for (const p of safeGraph.prereqOf.get(id) ?? []) {
      if (ownGapStatus(p) !== 'COMPLETE') expand(p);
    }
  }
  for (const id of candidateIds) expand(id);

  if (included.size === 0) {
    return { milestones: [], excludedCycleSkillIds };
  }

  const blockingPower = computeBlockingPower(safeGraph);
  const maxBlocking = Math.max(1, ...Array.from(included).map((id) => blockingPower.get(id) ?? 0));
  const daysRemaining = ctx.targetDateISO ? daysBetween(ctx.now, new Date(ctx.targetDateISO)) : null;

  const draftSkills = new Map<string, DraftRoadmapSkill>();
  for (const id of included) {
    const state = ctx.masteryStates.get(id) ?? emptyMasteryState(ctx.studentId, id);
    const own = ownGapStatus(id);
    const ready = prerequisitesReady(id);
    const schedulingStatus = resolveSchedulingStatus(own, ready);
    const tier = skillPriorityTier.get(id) ?? 'MEDIUM';
    const required = skillRequired.get(id) ?? true;
    const blockNorm = (blockingPower.get(id) ?? 0) / maxBlocking;
    const { score, breakdown } = computePriority({
      priorityTier: tier,
      gapStatus: schedulingStatus,
      required,
      blockingPowerNormalized: blockNorm,
      daysRemaining,
      trend: state.trend,
    });
    const isDirectCompetency = skillTarget.has(id);
    draftSkills.set(id, {
      skillId: id,
      skillName: safeGraph.skills.get(id)!.name,
      required,
      priorityScore: score,
      priorityBreakdown: breakdown,
      gapStatus: schedulingStatus,
      targetMastery: effectiveTarget(id),
      currentMasterySnapshot: state.masteryLevel,
      activityType: activityTypeFor(schedulingStatus),
      learningObjective: learningObjectiveFor(schedulingStatus, safeGraph.skills.get(id)!.name, effectiveTarget(id)),
      sequence: 0,
      insertedReason: isDirectCompetency ? null : describeInsertionReason(safeGraph, id),
    });
  }

  const layers = computeLayers(safeGraph, included);
  const layerGroups = new Map<number, string[]>();
  for (const id of included) {
    const l = layers.get(id) ?? 0;
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(id);
  }

  const sortedLayerKeys = Array.from(layerGroups.keys()).sort((a, b) => a - b);
  const milestones: DraftMilestone[] = [];
  let seq = 0;
  for (const layerKey of sortedLayerKeys) {
    const idsInLayer = layerGroups
      .get(layerKey)!
      .sort((a, b) => draftSkills.get(b)!.priorityScore - draftSkills.get(a)!.priorityScore);

    for (let i = 0; i < idsInLayer.length; i += MAX_SKILLS_PER_MILESTONE) {
      const chunk = idsInLayer.slice(i, i + MAX_SKILLS_PER_MILESTONE);
      const skills = chunk.map((id, idx) => {
        const s = draftSkills.get(id)!;
        s.sequence = idx;
        return s;
      });
      const categories = chunk.map((id) => ctx.allSkills.find((s) => s.id === id)?.category ?? 'General');
      milestones.push({
        sequence: seq++,
        name: nameForCategories(categories, seq),
        description: `Focused on: ${skills.map((s) => s.skillName).join(', ')}.`,
        skills,
        completionConditions: defaultCompletionConditions(),
      });
    }
  }

  return { milestones, excludedCycleSkillIds };
}

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function activityTypeFor(status: GapStatus): ActivityType {
  switch (status) {
    case 'UNKNOWN':
      return 'EXPLORATION';
    case 'CRITICAL_GAP':
    case 'GAP':
      return 'TARGETED_PRACTICE';
    case 'DEVELOPING':
      return 'PRACTICE';
    case 'INSUFFICIENT_EVIDENCE':
      return 'VERIFICATION';
    case 'BLOCKED':
      return 'REVIEW';
    default:
      return 'PRACTICE';
  }
}

function learningObjectiveFor(status: GapStatus, skillName: string, target: MasteryLevel): string {
  switch (status) {
    case 'UNKNOWN':
      return `Assess current ability in ${skillName} — no prior evidence exists yet, so this is exploration, not remediation.`;
    case 'CRITICAL_GAP':
      return `Close a significant gap in ${skillName}: current evidence is well below the ${target} level this path requires.`;
    case 'GAP':
      return `Build ${skillName} up to ${target} through targeted, evidence-generating practice.`;
    case 'DEVELOPING':
      return `Round out ${skillName} — you're close to ${target}; consolidate it with independent practice.`;
    case 'INSUFFICIENT_EVIDENCE':
      return `Confirm ${skillName} with an independent verification attempt — the current rating rests on too little evidence to trust yet.`;
    case 'BLOCKED':
      return `Hold on ${skillName} until its prerequisite is solid — attempting it now would mostly surface prerequisite gaps, not ${skillName} itself.`;
    default:
      return `Maintain ${skillName} at ${target}.`;
  }
}

function describeInsertionReason(graph: SkillGraph, skillId: string): string {
  const dependents = (graph.dependentsOf.get(skillId) ?? [])
    .map((d) => graph.skills.get(d)?.name)
    .filter((n): n is string => Boolean(n));
  if (dependents.length === 0) return 'Inserted as a supporting prerequisite skill.';
  return `Inserted as a prerequisite of ${dependents.join(', ')} — current evidence shows this isn't solid enough yet to build on.`;
}

function nameForCategories(categories: string[], fallbackIndex: number): string {
  const counts = new Map<string, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  if (best && PHASE_NAME_BY_CATEGORY[best]) return PHASE_NAME_BY_CATEGORY[best];
  return best ? `${best} Milestone` : `Milestone ${fallbackIndex}`;
}

function removeSkillsFromGraph(graph: SkillGraph, remove: Set<string>): SkillGraph {
  const skills = new Map(Array.from(graph.skills.entries()).filter(([id]) => !remove.has(id)));
  const prereqOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const id of skills.keys()) {
    prereqOf.set(id, (graph.prereqOf.get(id) ?? []).filter((p) => !remove.has(p)));
    dependentsOf.set(id, (graph.dependentsOf.get(id) ?? []).filter((d) => !remove.has(d)));
  }
  return { skills, prereqOf, dependentsOf };
}
