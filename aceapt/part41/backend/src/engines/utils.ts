export function diffDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}

export function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

let counter = 0;
/** Deterministic-enough id for engine-internal objects that aren't persisted
 * through a repository (which assigns real ids). Repositories should NOT use
 * this — they use crypto.randomUUID(). */
export function tempId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
