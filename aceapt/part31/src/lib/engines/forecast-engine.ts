import type { SimulationResult } from '@/lib/db/schema';

export interface ForecastOutput {
  available: boolean;
  message: string;
  ratePerAttempt?: number;
  projectedAttemptsToThreshold?: number;
}

/**
 * Simple linear trend over the student's own reliable-attempt history. This
 * intentionally does NOT produce a "weeks until ready" figure — that would
 * require a pacing model (how many simulations per week a student runs)
 * that Feature 31 has no honest basis for. Spec §28 is explicit: "never
 * fabricate forecasts." What this *can* honestly compute is a trend across
 * the student's own attempts, so that's what it reports.
 */
export function projectReadiness(reliableResults: SimulationResult[], threshold: number): ForecastOutput {
  if (reliableResults.length < 2) {
    return { available: false, message: 'Not enough reliable simulation history yet — run at least two reliable simulations to see a trend.' };
  }

  const ordered = [...reliableResults].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const first = ordered[0].simulatedReadiness;
  const last = ordered[ordered.length - 1].simulatedReadiness;
  const attemptsSpan = ordered.length - 1;
  const ratePerAttempt = Math.round(((last - first) / attemptsSpan) * 10) / 10;

  if (last >= threshold) {
    return { available: true, message: `Your most recent reliable attempt already met or exceeded your target readiness threshold (${threshold}%).`, ratePerAttempt };
  }

  if (ratePerAttempt <= 0) {
    return {
      available: true,
      message: 'Your readiness has not shown a positive trend across your reliable attempts yet — the next simulation is more informative than a projection right now.',
      ratePerAttempt,
    };
  }

  const remaining = Math.max(0, threshold - last);
  const projectedAttemptsToThreshold = Math.max(1, Math.ceil(remaining / ratePerAttempt));

  return {
    available: true,
    message: `At your current rate of improvement (+${ratePerAttempt} pts/attempt), you're projected to reach target readiness in about ${projectedAttemptsToThreshold} more reliable simulation${projectedAttemptsToThreshold === 1 ? '' : 's'}.`,
    ratePerAttempt,
    projectedAttemptsToThreshold,
  };
}
