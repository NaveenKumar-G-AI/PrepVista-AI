/**
 * The 0-7 scaffold hierarchy from Section 22. If ACEAPT's real Feature 48
 * (Hint Intelligence) already owns this ladder, replace this module with a
 * thin adapter over it (Section 22: "use the actual architecture of
 * Feature 48 where available") - the rest of Feature 47 only depends on
 * the numeric level and the label, not on this file's internals.
 */
export const HELP_LEVEL_LABELS = [
  'NO_ASSISTANCE',
  'STEP_OUTLINE',
  'CURRENT_STEP_GUIDANCE',
  'SMALL_HINT',
  'DETAILED_GUIDANCE',
  'PARTIAL_SOLUTION',
  'WORKED_STEP',
  'FULL_SOLUTION',
] as const;

export type HelpLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MAX_AUTO_ESCALATION_LEVEL: HelpLevel = 6; // Level 7 (full solution) is never auto-escalated to.

export function helpLevelLabel(level: number): string {
  return HELP_LEVEL_LABELS[level] ?? 'UNKNOWN';
}

/**
 * Section 24: escalate by exactly one meaningful level per additional
 * failure on the *same* step, stopping automatically the moment the student
 * recovers (the caller resets the counter on a correct/partially-correct
 * result - see GuidedSolvingService). Full solution (7) is reserved for an
 * explicit, manual "show me the solution" request (Section 28) and is never
 * something the system escalates into on its own.
 */
export function nextAutoEscalationLevel(currentLevel: number, consecutiveFailuresOnThisStep: number): HelpLevel {
  if (consecutiveFailuresOnThisStep <= 0) return currentLevel as HelpLevel;
  const next = Math.min(currentLevel + 1, MAX_AUTO_ESCALATION_LEVEL);
  return next as HelpLevel;
}

/** Section 78: after a step is solved, help eases back down rather than staying pinned high forever. */
export function decayLevelAfterSuccess(currentLevel: number): HelpLevel {
  return Math.max(currentLevel - 1, 0) as HelpLevel;
}
