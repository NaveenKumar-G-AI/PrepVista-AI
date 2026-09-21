/**
 * Exponential recency decay shared by aggregate.ts and confidence.ts so the
 * two never drift apart on how "old evidence counts less" is computed.
 */
export function recencyDecay(evidenceIso: string, nowIso: string, halfLifeDays: number): number {
  const ageMs = new Date(nowIso).getTime() - new Date(evidenceIso).getTime();
  const ageDays = Math.max(0, ageMs / 86_400_000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}
