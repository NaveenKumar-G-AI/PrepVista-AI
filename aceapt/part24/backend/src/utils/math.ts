export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = average(values);
  return average(values.map((v) => (v - m) ** 2));
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function daysBetweenIso(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.abs(a - b) / 86_400_000;
}

/** Returns an ISO timestamp `n` days before `from` (defaults to now). Used
 * both for seeding demo history and for the demo "simulate time passing"
 * control — never used to silently fabricate evidence that wasn't actually
 * submitted. */
export function daysAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}
