import type { DB } from '../db/client.js';
import { config } from '../config/index.js';
import { SkillGraphService } from '../skillgraph/skillGraphService.js';
import { MasteryStateService } from '../mastery/masteryStateService.js';
import type { GapAssessment } from '../types.js';

/**
 * When a skill looks weak, checks whether a PREREQUISITE is actually the
 * root cause before concluding the skill itself needs harder practice
 * (Phase 12). Walks the prerequisite chain (not just direct parents) and
 * returns the shallowest weak prerequisite found, since remediating the
 * earliest broken link in the chain is the highest-leverage move.
 */
export class PrerequisiteAnalyzer {
  private skillGraph: SkillGraphService;
  private masteryState: MasteryStateService;

  constructor(private db: DB) {
    this.skillGraph = new SkillGraphService(db);
    this.masteryState = new MasteryStateService(db);
  }

  /**
   * Returns a PREREQUISITE_GAP assessment TARGETING the weakest prerequisite
   * in the chain if one is under-ready, else null (meaning: the skill's own
   * weakness, if any, is NOT explained by a shaky foundation).
   *
   * IMPORTANT: the returned assessment's `skillId` is the PREREQUISITE
   * itself (e.g. Arrays), not the skill that was originally asked about
   * (e.g. Searching) — the whole point of Phase 12 is that the
   * recommendation must actually be FOR the weak foundation, not merely
   * mention it while still practicing the dependent skill.
   */
  analyze(studentId: string, skillId: string): GapAssessment | null {
    const direct = this.skillGraph.getDirectPrerequisites(skillId);
    if (direct.length === 0) return null;

    let weakest: { skillId: string; skillName: string; score: number } | null = null;
    for (const { skill } of direct) {
      const state = this.masteryState.getState(studentId, skill.id);
      const score = state?.masteryScore ?? 0;
      if (score < config.mastery.prerequisiteReadinessScoreThreshold) {
        if (!weakest || score < weakest.score) weakest = { skillId: skill.id, skillName: skill.name, score };
      }
    }
    if (!weakest) return null;

    // Recurse: the weak prerequisite might itself have an even-earlier weak prerequisite.
    // If so, that deeper assessment is already correctly targeted — use it as-is.
    const deeper = this.analyze(studentId, weakest.skillId);
    if (deeper) return deeper;

    const dependentSkill = this.skillGraph.getSkill(skillId);
    return {
      skillId: weakest.skillId, // target the prerequisite itself
      gapType: 'PREREQUISITE_GAP',
      severity: 0.85,
      explanation: `"${dependentSkill?.name ?? skillId}" depends on "${weakest.skillName}", which has a mastery score of only ${weakest.score.toFixed(1)} — below the ${config.mastery.prerequisiteReadinessScoreThreshold} readiness threshold. Strengthening "${weakest.skillName}" first is higher-leverage than harder practice on "${dependentSkill?.name ?? skillId}".`,
      rootCauseSkillId: weakest.skillId,
    };
  }

  /** Convenience: is this skill currently ready (no under-ready prerequisite)? */
  isReady(studentId: string, skillId: string): boolean {
    return this.analyze(studentId, skillId) === null;
  }
}
