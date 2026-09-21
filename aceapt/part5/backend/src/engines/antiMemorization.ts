import { ExposureRow } from "../repositories/questionRepository";
import { Question } from "../domain/types";

/** How much a question's selection score should be discounted for repeat exposure. */
export function noveltyPenalty(exposure: ExposureRow | undefined): number {
  if (!exposure) return 0;
  // First repeat is a mild penalty (some spaced repetition is fine); by the
  // third exposure it's heavily discouraged, and if it's already been
  // answered correctly twice it's treated as burned for straight reuse —
  // §17/§18 want variation at that point, not the same item again.
  if (exposure.seenCount === 0) return 0;
  if (exposure.correctCount >= 2) return 0.9;
  if (exposure.seenCount === 1) return 0.25;
  if (exposure.seenCount === 2) return 0.55;
  return 0.85;
}

/**
 * §17 — a student who is only ever correct on questions they've seen before,
 * and whose accuracy drops noticeably on first-exposure questions of the
 * same skill, is showing answer memory rather than concept mastery. This
 * flag feeds MasteryEvidenceEngine (a memorization flag blocks
 * VERIFIED_MASTERY) and the selection engine (forces novel/varied structure).
 */
export function detectSuspectedMemorization(
  exposures: { exposure: ExposureRow | undefined; question: Question; wasCorrect: boolean }[]
): { suspected: boolean; rationale: string } {
  const repeats = exposures.filter((e) => (e.exposure?.seenCount ?? 0) > 0);
  const firstExposures = exposures.filter((e) => (e.exposure?.seenCount ?? 0) === 0);

  if (repeats.length < 3 || firstExposures.length < 2) {
    return { suspected: false, rationale: "Not enough novel-question attempts yet to compare." };
  }

  const repeatAccuracy = repeats.filter((e) => e.wasCorrect).length / repeats.length;
  const firstExposureAccuracy = firstExposures.filter((e) => e.wasCorrect).length / firstExposures.length;

  const suspected = repeatAccuracy - firstExposureAccuracy >= 0.4 && repeatAccuracy >= 0.8;
  return {
    suspected,
    rationale: suspected
      ? `Accuracy on repeated questions (${Math.round(repeatAccuracy * 100)}%) is much higher than on first-time questions (${Math.round(
          firstExposureAccuracy * 100
        )}%) — looks like answer memory rather than transferable understanding.`
      : "Accuracy on repeated and novel questions is reasonably close — no memorization signal.",
  };
}

/** Should this skill's next question be forced toward a varied/transfer structure? */
export function needsVariation(exposure: ExposureRow | undefined, suspectedMemorization: boolean): boolean {
  if (suspectedMemorization) return true;
  return !!exposure && exposure.correctCount >= 2;
}
