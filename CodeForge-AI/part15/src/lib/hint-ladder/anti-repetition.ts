/**
 * Anti-repetition.
 *
 * Tracks the underlying TEACHING CONCEPT + TARGET + DEPTH + STRATEGY of
 * every hint actually delivered, not the exact text. This is what
 * prevents "Check the loop boundary." from being immediately followed by
 * a reworded "Take another look at your loop condition." — the two would
 * have identical signatures even though the words differ.
 */

import {
  AssistanceLevel,
  DeliveredHintRecord,
  FAILED_HINT_STRATEGY_CHAIN,
  HintType,
  TeachingConcept,
} from "./types";

export function buildTargetSignature(concept: TeachingConcept, targetArea: string | null): string {
  const normalizedTarget = (targetArea ?? "unscoped").trim().toLowerCase().replace(/\s+/g, "_");
  return `${concept}:${normalizedTarget}`;
}

function fullSignature(record: Pick<DeliveredHintRecord, "targetSignature" | "level" | "hintType">): string {
  return `${record.targetSignature}:${record.level}:${record.hintType}`;
}

export function isDuplicateHint(
  history: DeliveredHintRecord[],
  candidate: { targetSignature: string; level: AssistanceLevel; hintType: HintType }
): boolean {
  const seen = new Set(history.map(fullSignature));
  return seen.has(fullSignature(candidate));
}

/**
 * When the previous hint at the SAME concept/target didn't help, walk the
 * failed-hint strategy chain to the next untried hint type for that
 * concept/target. If every strategy in the chain has been tried at the
 * current level, the caller should escalate the assistance LEVEL instead
 * (policy-engine.ts owns that decision) — this function only ever
 * recommends a strategy change, never a level change.
 */
export function nextUntriedStrategy(
  history: DeliveredHintRecord[],
  targetSignature: string,
  level: AssistanceLevel
): HintType | null {
  const triedTypesAtThisTarget = new Set(
    history
      .filter((h) => h.targetSignature === targetSignature && h.level === level)
      .map((h) => h.hintType)
  );

  for (const strategy of FAILED_HINT_STRATEGY_CHAIN) {
    if (!triedTypesAtThisTarget.has(strategy)) return strategy;
  }
  return null; // every strategy in the chain exhausted at this level
}

/** How many DISTINCT (concept+target) issues has this session already worked through? Useful for analytics/frustration signals. */
export function distinctTargetsAddressed(history: DeliveredHintRecord[]): number {
  return new Set(history.map((h) => h.targetSignature)).size;
}
