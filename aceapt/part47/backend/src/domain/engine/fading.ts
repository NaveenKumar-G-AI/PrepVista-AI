import type { HelpLevel } from './helpLevels.js';

export type SolveOutcome = 'INDEPENDENT' | 'RECOVERED_WITH_GUIDANCE' | 'FAILED' | 'SOLUTION_REVEALED';

export interface PastProblemRecord {
  outcome: SolveOutcome;
  hintsUsed: number;
}

/**
 * Recommends the STARTING help level for the student's next guided problem,
 * based on evidence from recent problems (Section 33: "this should be
 * evidence-based", Section 78: fade after verification success, hold/raise
 * after failure). This is a *suggestion* surfaced to the student, never a
 * forced floor - Section 23 requires starting with the lowest useful
 * assistance and the student can always ask for more (Section 25).
 */
export function recommendNextHelpLevel(history: PastProblemRecord[]): HelpLevel {
  const recent = history.slice(-3);
  if (recent.length === 0) return 1; // Section 23 default: step outline, not zero, on a totally new student.

  const allIndependent = recent.every((h) => h.outcome === 'INDEPENDENT' && h.hintsUsed === 0);
  if (allIndependent && recent.length >= 2) return 0;

  const anyFailedOrRevealed = recent.some((h) => h.outcome === 'FAILED' || h.outcome === 'SOLUTION_REVEALED');
  if (anyFailedOrRevealed) return 2;

  const anyRecovered = recent.some((h) => h.outcome === 'RECOVERED_WITH_GUIDANCE');
  if (anyRecovered) return 1;

  return 1;
}

export type GuidanceDependency = 'LOW' | 'MODERATE' | 'HIGH';

/**
 * Section 46: a signal, never a verdict on the student. Deliberately framed
 * so the copy layer can say "you currently benefit from step guidance",
 * never "you are weak at this."
 */
export function computeGuidanceDependency(input: { stepsTotal: number; hintsUsed: number; retries: number }): GuidanceDependency {
  if (input.stepsTotal === 0) return 'LOW';
  const hintsPerStep = input.hintsUsed / input.stepsTotal;
  if (hintsPerStep === 0 && input.retries <= 1) return 'LOW';
  if (hintsPerStep <= 0.5) return 'MODERATE';
  return 'HIGH';
}
