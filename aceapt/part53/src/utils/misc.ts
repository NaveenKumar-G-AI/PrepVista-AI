import { randomUUID, createHash } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Relative + absolute tolerance float comparison — avoids classic 0.1+0.2 !== 0.3 false negatives
 *  and correctly treats e.g. 99.999 as a match for 100 while still catching a real 100 vs 125 mismatch. */
export function isApproximatelyEqual(a: number, b: number, relTol = 0.005, absTol = 1e-6): boolean {
  return Math.abs(a - b) <= Math.max(absTol, relTol * Math.max(Math.abs(a), Math.abs(b)));
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function now(): string {
  return new Date().toISOString();
}
