import type { SkillState, ConfidenceLevel, SkillStateLabel } from '../types/skill-state.js';
import type { GrowthEvent } from '../types/growth-event.js';
import type { GrowthMilestone } from '../types/milestone.js';
import { GROWTH_MODEL_VERSION } from '../config/growth-rules.js';
import { ladderIndex } from '../skill-state/state-machine.js';

/**
 * Growth Event Engine (section 28). Turns a (previous snapshot, new
 * snapshot) pair into zero or more typed, evidence-linked events. Purely a
 * diff function — it never mutates state, only describes what changed and
 * why, in a short deterministic sentence (never an AI paraphrase — see
 * src/insights for the AI-assisted narrative layer, which is optional and
 * separate from this).
 */

const DECLINE_STATES = new Set<SkillStateLabel>(['AT_RISK', 'REGRESSING']);
const RECOVERY_SOURCE_STATES = new Set<SkillStateLabel>(['AT_RISK', 'REGRESSING', 'RECOVERING']);
const LADDER_TARGET_STATES = new Set<SkillStateLabel>(['PRACTICED', 'PROFICIENT', 'MASTERED']);

export function deriveSkillGrowthEvents(
  prev: SkillState | null,
  next: SkillState,
  nowIso: string,
  generateId: () => string,
): GrowthEvent[] {
  const events: GrowthEvent[] = [];
  const base = {
    studentId: next.studentId,
    skillId: next.skillId,
    timestamp: nowIso,
    evidenceRefs: next.evidenceRefs,
    confidence: next.confidence.level,
    modelVersion: GROWTH_MODEL_VERSION,
  };

  const prevState = prev?.state ?? null;
  const nothingChanged = prevState === next.state && (!prev || prev.transfer === next.transfer) && (!prev || prev.retention === next.retention);
  if (nothingChanged) return events;

  if (prevState === null || prevState === 'UNKNOWN') {
    if (next.state !== 'UNKNOWN') {
      events.push({
        ...base,
        eventId: generateId(),
        eventType: 'SKILL_ACQUIRED',
        previousState: prevState,
        newState: next.state,
        explanation: `First evidence-backed demonstration of this skill, from ${next.evidenceCount} record${next.evidenceCount === 1 ? '' : 's'}.`,
      });
    }
  } else if (prevState !== next.state) {
    const prevIdx = ladderIndex(prevState);
    const nextIdx = ladderIndex(next.state);

    if (DECLINE_STATES.has(next.state) && !DECLINE_STATES.has(prevState)) {
      events.push({
        ...base,
        eventId: generateId(),
        eventType: 'SKILL_REGRESSED',
        previousState: prevState,
        newState: next.state,
        explanation: `Recent evidence shows a sustained decline from ${prevState} — moved to ${next.state}.`,
      });
    } else if (RECOVERY_SOURCE_STATES.has(prevState) && LADDER_TARGET_STATES.has(next.state)) {
      events.push({
        ...base,
        eventId: generateId(),
        eventType: 'SKILL_RECOVERED',
        previousState: prevState,
        newState: next.state,
        explanation: `Sustained positive evidence following a ${prevState.toLowerCase()} period — recovered to ${next.state}.`,
      });
    } else if (prevIdx >= 0 && nextIdx >= 0 && nextIdx > prevIdx) {
      events.push({
        ...base,
        eventId: generateId(),
        eventType: next.state === 'MASTERED' ? 'SKILL_MASTERED' : 'SKILL_IMPROVED',
        previousState: prevState,
        newState: next.state,
        explanation:
          next.state === 'MASTERED'
            ? `Reached mastery with ${next.evidenceCount} corroborating records and ${next.confidence.level.toLowerCase()} confidence.`
            : `Improved from ${prevState} to ${next.state} on ${next.evidenceCount} corroborating records.`,
      });
    }
  }

  if (prev && prev.transfer !== 'STRONG' && next.transfer === 'STRONG') {
    events.push({
      ...base,
      eventId: generateId(),
      eventType: 'TRANSFER_CONFIRMED',
      previousState: prevState,
      newState: next.state,
      explanation: 'Successful application of this skill across multiple unfamiliar contexts.',
    });
  }

  if (prev && prev.retention !== 'RETAINED' && prev.retention !== 'UNKNOWN' && next.retention === 'RETAINED') {
    events.push({
      ...base,
      eventId: generateId(),
      eventType: 'RETENTION_CONFIRMED',
      previousState: prevState,
      newState: next.state,
      explanation: 'Skill remained available after a gap in practice — retention confirmed by new evidence.',
    });
  }

  return events;
}

export function createBottleneckEvent(
  studentId: string,
  skillId: string,
  evidenceRefs: string[],
  confidence: ConfidenceLevel,
  nowIso: string,
  generateId: () => string,
): GrowthEvent {
  return {
    eventId: generateId(),
    studentId,
    skillId,
    eventType: 'BOTTLENECK_IDENTIFIED',
    timestamp: nowIso,
    evidenceRefs,
    confidence,
    previousState: null,
    newState: null,
    explanation: 'This skill is currently the primary factor limiting overall progress, trailing otherwise-proficient peer skills by a meaningful margin.',
    modelVersion: GROWTH_MODEL_VERSION,
  };
}

export function createMilestoneReachedEvent(milestone: GrowthMilestone, generateId: () => string): GrowthEvent {
  return {
    eventId: generateId(),
    studentId: milestone.studentId,
    skillId: milestone.skillId,
    eventType: 'MILESTONE_REACHED',
    timestamp: milestone.timestamp,
    evidenceRefs: milestone.evidenceRefs,
    confidence: milestone.confidence,
    previousState: null,
    newState: null,
    explanation: milestone.description,
    modelVersion: GROWTH_MODEL_VERSION,
  };
}

/**
 * Only ever called by an external caller that owns real role-readiness
 * logic (section 32) — this module does not decide readiness itself, it
 * just knows how to record the signal once told.
 */
export function createRoleReadinessEvent(
  studentId: string,
  roleId: string,
  evidenceRefs: string[],
  explanation: string,
  confidence: ConfidenceLevel,
  nowIso: string,
  generateId: () => string,
): GrowthEvent {
  return {
    eventId: generateId(),
    studentId,
    skillId: null,
    eventType: 'ROLE_READINESS_IMPROVED',
    timestamp: nowIso,
    evidenceRefs,
    confidence,
    previousState: null,
    newState: null,
    explanation: `[${roleId}] ${explanation}`,
    modelVersion: GROWTH_MODEL_VERSION,
  };
}
