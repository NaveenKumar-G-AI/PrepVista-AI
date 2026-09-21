import type { ConsistencyResult } from "../types/domain.js";

const CHUNK_SIZE = 3;
const SPREAD_THRESHOLD = 0.5;
const HIGH_BAND = 0.7;
const LOW_BAND = 0.3;

/**
 * Chunks a chronological correct/incorrect sequence and looks for
 * alternating high/low blocks rather than a single trend. Needs at least
 * two real chunks before it will claim anything either way — "do not judge
 * capability from isolated results" cuts both ways: it also shouldn't cry
 * "inconsistent" off three data points.
 */
export function analyzeConsistency(skillNodeId: string, chronologicalCorrectness: boolean[]): ConsistencyResult {
  if (chronologicalCorrectness.length < CHUNK_SIZE * 2) {
    return { skillNodeId, isConsistent: true, chunkAccuracies: [], note: "insufficient evidence to assess consistency" };
  }

  const chunks: boolean[][] = [];
  for (let i = 0; i < chronologicalCorrectness.length; i += CHUNK_SIZE) {
    chunks.push(chronologicalCorrectness.slice(i, i + CHUNK_SIZE));
  }
  // A trailing half-chunk swings too easily on 1-2 responses — fold it into the prior chunk instead of judging it alone.
  if (chunks.length > 1 && chunks[chunks.length - 1]!.length < CHUNK_SIZE / 2) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1]!.push(...tail);
  }

  const chunkAccuracies = chunks.map((c) => Number((c.filter(Boolean).length / c.length).toFixed(2)));
  const max = Math.max(...chunkAccuracies);
  const min = Math.min(...chunkAccuracies);
  const spread = max - min;
  const flaggedInconsistent = spread > SPREAD_THRESHOLD && max >= HIGH_BAND && min <= LOW_BAND;

  return {
    skillNodeId,
    isConsistent: !flaggedInconsistent,
    chunkAccuracies,
    note: flaggedInconsistent
      ? "performance swings between strong and weak blocks rather than trending consistently"
      : undefined,
  };
}
