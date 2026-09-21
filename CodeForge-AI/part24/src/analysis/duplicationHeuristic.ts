/**
 * Detects whether a newly-added region closely duplicates existing code
 * elsewhere in the same file, using normalized line-window similarity.
 * This is a genuine (if intentionally simple) O(n*m) scan — a reference
 * implementation of the duplication-evidence contract. CodeForge's actual
 * Feature 18 engine is the authoritative source in production.
 */

export interface DuplicationResult {
  duplicated: boolean;
  similarity: number;
  matchedRange?: { start: number; end: number };
}

const THRESHOLD = 0.8;
const MIN_LINES = 3;

function normalize(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

export function detectNearDuplicate(
  newRegionLines: string[],
  fileLines: string[],
  regionStartLine: number,
  regionEndLine: number,
): DuplicationResult {
  const regionNorm = newRegionLines.map(normalize).filter(Boolean);
  if (regionNorm.length < MIN_LINES) return { duplicated: false, similarity: 0 };

  const windowSize = regionNorm.length;
  let best = 0;
  let bestStart = -1;

  for (let start = 0; start <= fileLines.length - windowSize; start++) {
    const windowStartLine = start + 1;
    const windowEndLine = start + windowSize;
    const overlapsSelf = windowStartLine <= regionEndLine && regionStartLine <= windowEndLine;
    if (overlapsSelf) continue;

    const windowNorm = fileLines.slice(start, start + windowSize).map(normalize);
    const matches = windowNorm.filter((l, i) => l.length > 0 && l === regionNorm[i]).length;
    const similarity = matches / windowSize;
    if (similarity > best) {
      best = similarity;
      bestStart = start;
    }
  }

  return {
    duplicated: best >= THRESHOLD,
    similarity: best,
    matchedRange: bestStart >= 0 ? { start: bestStart + 1, end: bestStart + windowSize } : undefined,
  };
}
