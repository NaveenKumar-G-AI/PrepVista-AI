import type { SkillStateLabel, TrajectoryLabel, ConfidenceLevel, TransferState, RetentionState } from '@/types/skill-state.js';
import type { GrowthEventType } from '@/types/growth-event.js';

/**
 * All user-facing copy lives here, in plain student-facing language —
 * deliberately NOT the forge/metallurgy vocabulary the visual design uses
 * internally. Section 68: feedback must be accurate, actionable,
 * respectful, evidence-backed — a cute metaphor in the actual UI copy
 * would work against that, even though it's the right call for the
 * visual identity.
 */

const STATE_LABEL: Record<SkillStateLabel, string> = {
  UNKNOWN: 'Not started yet',
  INTRODUCED: 'Just introduced',
  DEVELOPING: 'Developing',
  PRACTICED: 'Practiced',
  PROFICIENT: 'Proficient',
  MASTERED: 'Mastered',
  AT_RISK: 'At risk',
  REGRESSING: 'Declining',
  RECOVERING: 'Recovering',
  UNCERTAIN: 'Uncertain — needs more evidence',
};
export function skillStateLabel(state: SkillStateLabel): string {
  return STATE_LABEL[state];
}

const TRAJECTORY_LABEL: Record<TrajectoryLabel, string> = {
  RAPIDLY_IMPROVING: 'Improving quickly',
  IMPROVING: 'Improving',
  STABLE: 'Stable',
  SLOWING: 'Improving, but slower than before',
  DECLINING: 'Declining',
  RECOVERING: 'Recovering',
  INSUFFICIENT_EVIDENCE: 'Not enough evidence yet',
};
export function trajectoryLabel(t: TrajectoryLabel): string {
  return TRAJECTORY_LABEL[t];
}

const TRANSFER_LABEL: Record<TransferState, string> = {
  UNKNOWN: 'Not tested in a new context yet',
  WEAK: 'Limited outside familiar problems',
  MODERATE: 'Works in some new contexts',
  STRONG: 'Applies well to unfamiliar problems',
};
export function transferLabel(t: TransferState): string {
  return TRANSFER_LABEL[t];
}

const RETENTION_LABEL: Record<RetentionState, string> = {
  RETAINED: 'Holding steady',
  AT_RISK: 'Starting to fade without practice',
  REQUIRES_REINFORCEMENT: 'Could use a refresher',
  LOST_CONFIDENCE: 'Hasn’t been exercised in a while',
  UNKNOWN: 'Not enough history yet',
};
export function retentionLabel(r: RetentionState): string {
  return RETENTION_LABEL[r];
}

export function confidenceLabel(c: ConfidenceLevel): string {
  if (c === 'HIGH') return 'high confidence';
  if (c === 'MODERATE') return 'moderate confidence';
  return 'low confidence';
}

const EVENT_LABEL: Record<GrowthEventType, string> = {
  SKILL_ACQUIRED: 'Started this skill',
  SKILL_IMPROVED: 'Improved',
  SKILL_MASTERED: 'Reached mastery',
  SKILL_REGRESSED: 'Declined',
  SKILL_RECOVERED: 'Recovered',
  TRANSFER_CONFIRMED: 'Applied it in a new context',
  RETENTION_CONFIRMED: 'Still holding steady after a gap',
  BOTTLENECK_IDENTIFIED: 'Identified as a current bottleneck',
  MILESTONE_REACHED: 'Milestone reached',
  ROLE_READINESS_IMPROVED: 'Role readiness improved',
};
export function eventTypeLabel(t: GrowthEventType): string {
  return EVENT_LABEL[t];
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export function evidenceCountLabel(count: number): string {
  return `${count} piece${count === 1 ? '' : 's'} of evidence`;
}
