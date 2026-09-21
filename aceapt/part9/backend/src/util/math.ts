export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/** Splits an ordered array into `n` roughly-equal contiguous segments. */
export function splitIntoSegments<T>(items: T[], n: number): T[][] {
  if (items.length === 0) return Array.from({ length: n }, () => []);
  const segments: T[][] = [];
  const size = Math.ceil(items.length / n);
  for (let i = 0; i < n; i++) {
    segments.push(items.slice(i * size, (i + 1) * size));
  }
  return segments;
}

/** Fisher-Yates shuffle, mutates and returns the array. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
