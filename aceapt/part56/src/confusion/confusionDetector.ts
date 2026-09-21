import { TrainingAttemptRepository } from '../repositories';

const DEFAULT_THRESHOLD = 2;
const DEFAULT_WINDOW = 20;
const DEFAULT_RESOLUTION_STREAK = 3;
const DEFAULT_RESOLUTION_LOOKBACK = 10;

/**
 * Detects and resolves formula-confusion patterns (spec sections 22, 37-39,
 * 129, 153, 185, 216). Deliberately stateless / derived entirely from the
 * attempt log (TrainingAttemptRepository) rather than a second, parallel
 * store - one source of truth for "what actually happened".
 */
export class ConfusionDetector {
  constructor(private readonly attemptRepo: TrainingAttemptRepository) {}

  /**
   * True if the student has repeatedly selected formulaB when formulaA was
   * correct (or vice versa) within the recent window.
   */
  async getConfusionPattern(
    studentId: string,
    formulaA: string,
    formulaB: string,
    opts: { threshold?: number; window?: number } = {},
  ): Promise<boolean> {
    const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    const window = opts.window ?? DEFAULT_WINDOW;

    const attempts = (await this.attemptRepo.listAttempts(studentId))
      .filter((a) => a.activityType === 'SELECT' && !a.correct && a.distractorFormulaId)
      .slice(-window);

    const count = attempts.filter(
      (a) =>
        (a.formulaId === formulaA && a.distractorFormulaId === formulaB) ||
        (a.formulaId === formulaB && a.distractorFormulaId === formulaA),
    ).length;

    return count >= threshold;
  }

  /**
   * True once the student has strung together enough consecutive correct
   * discrimination attempts on this pair that the confusion can be
   * considered resolved (spec section 185) - intervention priority drops,
   * though occasional maintenance practice can continue (spec section 127).
   */
  async isConfusionResolved(
    studentId: string,
    formulaA: string,
    formulaB: string,
    opts: { requiredStreak?: number; lookback?: number } = {},
  ): Promise<boolean> {
    const requiredStreak = opts.requiredStreak ?? DEFAULT_RESOLUTION_STREAK;
    const lookback = opts.lookback ?? DEFAULT_RESOLUTION_LOOKBACK;

    const attempts = (await this.attemptRepo.listAttempts(studentId))
      .filter(
        (a) =>
          a.activityType === 'SELECT' && a.involvedConfusionPair && (a.formulaId === formulaA || a.formulaId === formulaB),
      )
      .slice(-lookback);

    if (attempts.length < requiredStreak) return false;
    const lastN = attempts.slice(-requiredStreak);
    return lastN.every((a) => a.correct);
  }

  /** Top confused pairs for a student, most frequent first (spec section 156). */
  async getTopConfusionPairs(studentId: string, limit = 5): Promise<Array<{ pair: [string, string]; count: number }>> {
    const attempts = (await this.attemptRepo.listAttempts(studentId)).filter(
      (a) => a.activityType === 'SELECT' && !a.correct && a.distractorFormulaId,
    );

    const counts = new Map<string, { pair: [string, string]; count: number }>();
    for (const a of attempts) {
      const sorted = [a.formulaId, a.distractorFormulaId as string].sort() as [string, string];
      const pairKey = sorted.join('::');
      const existing = counts.get(pairKey);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(pairKey, { pair: sorted, count: 1 });
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
