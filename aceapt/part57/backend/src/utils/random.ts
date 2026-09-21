/**
 * Deterministic PRNG (mulberry32) so property-based validation runs are
 * reproducible - the same shortcut version always gets tested against the
 * same sample set, which matters for CI and for debugging a FAIL result.
 */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
