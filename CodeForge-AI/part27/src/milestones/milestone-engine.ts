import type { ConfidenceLevel } from '../types/skill-state.js';
import type { MilestoneDefinition, MilestoneEligibilityContext, GrowthMilestone, MilestoneId } from '../types/milestone.js';
import { growthRules, GROWTH_MODEL_VERSION } from '../config/growth-rules.js';

/**
 * Milestone Engine (section 29-30). Every definition's isEligible() is a
 * pure function over already-persisted skill states and growth events —
 * never a counter, never a magic activity threshold ("completed 5
 * questions" is explicitly called out in section 29 as the kind of
 * milestone this engine must NOT produce).
 */

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

const definitions: MilestoneDefinition[] = [
  {
    id: 'FIRST_TRANSFER_OF_WEAK_CONCEPT',
    version: '1.0.0',
    minConfidenceScore: growthRules.milestones.minConfidenceScore,
    title: 'First successful transfer of a previously weak concept',
    describe: (_ctx, skillId) => `Applied a skill that had previously regressed to a new, unfamiliar context successfully${skillId ? ` (${skillId})` : ''}.`,
    isEligible: (ctx) => {
      for (const skillId of new Set(ctx.events.filter((e) => e.skillId).map((e) => e.skillId as string))) {
        const skillEvents = ctx.events.filter((e) => e.skillId === skillId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const firstRecoveredOrRegressed = skillEvents.find((e) => e.eventType === 'SKILL_REGRESSED' || e.eventType === 'SKILL_RECOVERED');
        const transferConfirmed = skillEvents.find((e) => e.eventType === 'TRANSFER_CONFIRMED');
        if (firstRecoveredOrRegressed && transferConfirmed && new Date(transferConfirmed.timestamp).getTime() >= new Date(firstRecoveredOrRegressed.timestamp).getTime()) {
          return { skillId, evidenceRefs: transferConfirmed.evidenceRefs, confidence: transferConfirmed.confidence };
        }
      }
      return null;
    },
  },
  {
    id: 'FIRST_RECOVERY',
    version: '1.0.0',
    minConfidenceScore: growthRules.milestones.minConfidenceScore,
    title: 'First recovery from a regression',
    describe: (_ctx, skillId) => `Recovered from a documented decline through sustained positive evidence${skillId ? ` (${skillId})` : ''}.`,
    isEligible: (ctx) => {
      const recovered = ctx.events.find((e) => e.eventType === 'SKILL_RECOVERED');
      if (!recovered) return null;
      return { skillId: recovered.skillId, evidenceRefs: recovered.evidenceRefs, confidence: recovered.confidence };
    },
  },
  {
    id: 'SUSTAINED_DEBUGGING_IMPROVEMENT',
    version: '1.0.0',
    minConfidenceScore: growthRules.milestones.minConfidenceScore,
    title: 'Sustained debugging improvement',
    describe: () => 'Debugging showed repeated, corroborated improvement rather than a single lucky fix.',
    isEligible: (ctx) => {
      const debuggingIds = ctx.debuggingSkillIds;
      if (!debuggingIds || debuggingIds.size === 0) return null; // section 10/31: we don't guess the taxonomy
      for (const skillId of debuggingIds) {
        const skillEvents = ctx.events
          .filter((e) => e.skillId === skillId && (e.eventType === 'SKILL_RECOVERED' || e.eventType === 'SKILL_IMPROVED'))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (skillEvents.length >= 2) {
          const last = skillEvents[skillEvents.length - 1]!;
          const allRefs = Array.from(new Set(skillEvents.flatMap((e) => e.evidenceRefs)));
          return { skillId, evidenceRefs: allRefs, confidence: last.confidence };
        }
      }
      return null;
    },
  },
  {
    id: 'STABLE_MASTERY_MULTI_CONTEXT',
    version: '1.0.0',
    minConfidenceScore: growthRules.milestones.minConfidenceScore,
    title: 'Stable mastery across multiple contexts',
    describe: (_ctx, skillId) => `Reached mastery with strong transfer and stable retention${skillId ? ` (${skillId})` : ''} — not just a single strong context.`,
    isEligible: (ctx) => {
      const stable = ctx.skillStates.find((s) => s.state === 'MASTERED' && s.confidence.level === 'HIGH' && s.transfer === 'STRONG' && s.retention === 'RETAINED');
      if (!stable) return null;
      return { skillId: stable.skillId, evidenceRefs: stable.evidenceRefs, confidence: stable.confidence.level };
    },
  },
  {
    id: 'ROLE_READINESS_THRESHOLD',
    version: '1.0.0',
    minConfidenceScore: growthRules.milestones.minConfidenceScore,
    title: 'First role-level readiness signal',
    describe: () => "Reached a readiness threshold reported by CodeForge's role-readiness system.",
    isEligible: (ctx) => {
      // Deliberately thin: role readiness is owned by CodeForge's existing
      // role system (section 32). This only reacts to a signal that system
      // already decided to report, via createRoleReadinessEvent.
      const readiness = ctx.events.find((e) => e.eventType === 'ROLE_READINESS_IMPROVED');
      if (!readiness) return null;
      return { skillId: null, evidenceRefs: readiness.evidenceRefs, confidence: readiness.confidence };
    },
  },
];

export function evaluateMilestones(
  ctx: MilestoneEligibilityContext,
  alreadyAwardedKeys: Set<string>,
  nowIso: string,
  generateId: () => string,
): GrowthMilestone[] {
  const results: GrowthMilestone[] = [];

  for (const def of definitions) {
    const eligibility = def.isEligible(ctx);
    if (!eligibility) continue;
    if (CONFIDENCE_RANK[eligibility.confidence] < CONFIDENCE_RANK.MODERATE) continue; // section 30: confidence-gated

    const key = milestoneKey(def.id, eligibility.skillId);
    if (alreadyAwardedKeys.has(key)) continue; // idempotent — never re-award the same milestone (section 57 applied to milestones)

    results.push({
      milestoneId: generateId(),
      definitionId: def.id,
      studentId: ctx.studentId,
      skillId: eligibility.skillId,
      title: def.title,
      description: def.describe(ctx, eligibility.skillId),
      timestamp: nowIso,
      evidenceRefs: eligibility.evidenceRefs,
      confidence: eligibility.confidence,
      definitionVersion: def.version,
    });
  }

  return results;
}

export function milestoneKey(definitionId: MilestoneId, skillId: string | null): string {
  return `${definitionId}:${skillId ?? 'student'}`;
}

export { definitions as milestoneDefinitions, GROWTH_MODEL_VERSION as milestoneEngineModelVersion };
