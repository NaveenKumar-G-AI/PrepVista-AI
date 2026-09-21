import { PoolClient } from 'pg';

export interface RoadmapRecalculationResult {
  triggered: boolean;
  next_action: string;
  reason: string;
}

export interface RoadmapTrigger {
  assessmentId: string;
  weakestSkills: { skill_id: string; skill_name: string; performance_level: string }[];
}

/**
 * Contract the assessment engine depends on (section 32). In the real
 * codebase, replace ReferenceRoadmapService with an adapter over the actual
 * Personalized Coding Roadmap Engine. This engine never writes roadmap
 * state directly — it only calls recalculate() and records whether it
 * succeeded (section 32: "use the roadmap service"; section 88: a roadmap
 * failure must never corrupt a valid, already-persisted assessment result).
 */
export interface RoadmapService {
  recalculate(
    client: PoolClient,
    studentId: string,
    roleId: string,
    trigger: RoadmapTrigger
  ): Promise<RoadmapRecalculationResult>;
}

/** DEMO_ONLY stand-in: picks the lowest-performing gated skill as "next action". */
export class ReferenceRoadmapService implements RoadmapService {
  async recalculate(
    _client: PoolClient,
    _studentId: string,
    _roleId: string,
    trigger: RoadmapTrigger
  ): Promise<RoadmapRecalculationResult> {
    if (trigger.weakestSkills.length === 0) {
      return {
        triggered: true,
        next_action: 'No critical gaps found — continue toward role-readiness verification.',
        reason: 'All gated competencies meet or exceed the readiness bar.',
      };
    }
    const worst = trigger.weakestSkills[0];
    return {
      triggered: true,
      next_action: `Remediation plan for ${worst.skill_name} (currently ${worst.performance_level}), then re-verify.`,
      reason: `${worst.skill_name} fell below the readiness gate on assessment ${trigger.assessmentId}.`,
    };
  }
}

/**
 * FAILING variant used only by the failure-recovery test (section 88) to
 * prove that a roadmap outage cannot corrupt an already-persisted
 * assessment result.
 */
export class AlwaysFailingRoadmapService implements RoadmapService {
  async recalculate(): Promise<RoadmapRecalculationResult> {
    throw new Error('Simulated roadmap engine outage');
  }
}

export const roadmapService: RoadmapService = new ReferenceRoadmapService();
