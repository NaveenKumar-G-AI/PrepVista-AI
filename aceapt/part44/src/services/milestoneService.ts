// Outcome-based milestones (Sections 10, 39). Milestones are generated
// from the goal's top priority once it's known, and are only ever
// marked ACHIEVED by evaluating real evidence against target_state -
// there is deliberately no "student clicks done" endpoint for a
// milestone (Section 33's system_verified/student_marked distinction
// applies at the goal level; at the milestone level, evidence is the
// only path to ACHIEVED).
import type pg from "pg";
import { milestoneRepository } from "../repositories/milestoneRepository.js";
import type { CapabilitySnapshot, GoalMilestone, PriorityTarget } from "../domain/types.js";

export interface MilestoneTemplateInput {
  focus: PriorityTarget;
  baselineScore: number | null;
  targetScore: number | null;
}

function label(focus: PriorityTarget): string {
  return focus.replace(/_/g, " ");
}

export function buildMilestoneTemplates(input: MilestoneTemplateInput) {
  const focusLabel = label(input.focus);
  const baseline = input.baselineScore;
  const target = input.targetScore;
  const midpoint = baseline !== null && target !== null ? round1(baseline + (target - baseline) * 0.6) : null;

  return [
    {
      title: "Foundation",
      description: `Establish a real baseline for ${focusLabel}.`,
      sequence: 1,
      targetState: { focus: input.focus, requires: "baseline_recorded" },
      evidenceRequired: `A capability snapshot exists for ${focusLabel}.`,
    },
    {
      title: "Core Skills",
      description: `Build consistent fundamentals in ${focusLabel}.`,
      sequence: 2,
      targetState: baseline !== null ? { focus: input.focus, minScore: round1(baseline + 8) } : { focus: input.focus },
      evidenceRequired: `Demonstrate improving ${focusLabel} performance across multiple sessions.`,
    },
    {
      title: "Timed Performance",
      description: `Hold that performance under real time pressure.`,
      sequence: 3,
      targetState: midpoint !== null ? { focus: input.focus, minScore: midpoint, minConsistency: 65 } : { focus: input.focus },
      evidenceRequired: `Demonstrate consistent medium-level ${focusLabel} performance under timed conditions.`,
    },
    {
      title: "Mixed Assessment",
      description: `Perform well alongside other topics, not just in isolation.`,
      sequence: 4,
      targetState: { minOverallProgress: 60 },
      evidenceRequired: `Demonstrate performance across a mixed-topic assessment, not just ${focusLabel} in isolation.`,
    },
    {
      title: "Verification",
      description: `Confirm target performance on a fresh, independent assessment.`,
      sequence: 5,
      targetState: target !== null ? { focus: input.focus, minScore: target, verification: true } : { focus: input.focus, verification: true },
      evidenceRequired: `Target performance for ${focusLabel} is confirmed on a fresh assessment.`,
    },
  ];
}

export const milestoneService = {
  async generateForGoal(
    client: pg.PoolClient,
    goalId: string,
    focus: PriorityTarget,
    baselineScore: number | null,
    targetScore: number | null
  ): Promise<GoalMilestone[]> {
    const templates = buildMilestoneTemplates({ focus, baselineScore, targetScore });
    return milestoneRepository.createMany(client, goalId, templates);
  },

  /** Evaluates the currently-ACTIVE milestone's target_state against the
   * latest capability snapshot and overall progress. Never marks
   * ACHIEVED without evidence (Section 33, 39). */
  async evaluate(
    client: pg.PoolClient,
    goalId: string,
    latest: CapabilitySnapshot,
    overallProgress: number
  ): Promise<GoalMilestone[]> {
    const milestones = await milestoneRepository.listForGoal(client, goalId);
    const active = milestones.find((m) => m.status === "ACTIVE");
    if (!active) return milestones;

    const state = active.targetState as any;
    let satisfied = false;

    if (state.requires === "baseline_recorded") {
      satisfied = true; // if we're evaluating at all, a snapshot exists
    } else if (typeof state.minOverallProgress === "number") {
      satisfied = overallProgress >= state.minOverallProgress;
    } else if (state.focus && typeof state.minScore === "number") {
      const score = scoreForFocus(state.focus, latest);
      const consistencyOk = typeof state.minConsistency !== "number" || (latest.consistency ?? 0) >= state.minConsistency;
      satisfied = score !== null && score >= state.minScore && consistencyOk;
    }

    if (satisfied) {
      await milestoneRepository.markAchieved(client, active.id);
      await milestoneRepository.activateNext(client, goalId, active.sequence);
      return milestoneRepository.listForGoal(client, goalId);
    }
    return milestones;
  },
};

function scoreForFocus(focus: PriorityTarget, snapshot: CapabilitySnapshot): number | null {
  if (focus === "speed") return null; // band, not a score - not evaluated numerically here
  if (focus === "accuracy") return snapshot.accuracy ?? null;
  return snapshot.scores[focus] ?? null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
