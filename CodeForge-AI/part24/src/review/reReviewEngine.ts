import type { DiffRegion, ReviewFinding, ReReviewOutcome, SourceFile } from '../domain/types';
import { contentSimilarity } from '../findings/fingerprint';
import { analyzeComplexity } from '../analysis/complexityHeuristic';

export interface ReReviewResult {
  findingId: string;
  outcome: ReReviewOutcome;
  newLocation?: { file: string; startLine: number; endLine: number };
  note: string;
}

export interface RegressionPair {
  resolvedFindingId: string;
  regressionFindingId: string;
  note: string;
}

const TERMINAL = new Set(['WONT_FIX', 'SUPERSEDED', 'RESOLVED']);
const MATCH_THRESHOLD = 0.5;
const SAME_LOCATION_TOLERANCE = 2;

/**
 * Re-evaluates every still-open finding from a previous review against a new
 * revision's diff and evidence, producing RESOLVED / STILL_PRESENT / MOVED /
 * INCONCLUSIVE outcomes. This never re-labels a finding by line number alone
 * — it checks whether the evidence that justified the finding still holds,
 * then uses fingerprint similarity only to relocate it if the code moved.
 */
export function reReviewFindings(
  previousFindings: ReviewFinding[],
  newDiffRegions: DiffRegion[],
  stillFailingEvidenceIds: Set<string>,
  targetFiles: SourceFile[] = [],
): ReReviewResult[] {
  const results: ReReviewResult[] = [];

  for (const finding of previousFindings) {
    if (finding.isPositive || TERMINAL.has(finding.status)) continue;

    const evidenceStillHolds = reconfirmEvidence(finding, stillFailingEvidenceIds, targetFiles);
    const match = bestMatch(finding.sourceSnippet, newDiffRegions);

    if (!evidenceStillHolds) {
      results.push({
        findingId: finding.id,
        outcome: 'RESOLVED',
        note: match.region
          ? `The flagged evidence no longer holds; the region now sits at ${match.region.file}:${match.region.afterStart}-${match.region.afterEnd}.`
          : 'The flagged evidence no longer holds and the original region was removed or fully rewritten.',
      });
      continue;
    }

    if (!match.region) {
      results.push({
        findingId: finding.id,
        outcome: 'INCONCLUSIVE',
        note: 'The underlying evidence still applies, but the original region could not be relocated in the new revision.',
      });
      continue;
    }

    const sameLocation =
      finding.sourceLocation?.file === match.region.file &&
      finding.sourceLocation !== undefined &&
      Math.abs(finding.sourceLocation.startLine - match.region.afterStart) <= SAME_LOCATION_TOLERANCE;

    results.push({
      findingId: finding.id,
      outcome: sameLocation ? 'STILL_PRESENT' : 'MOVED',
      newLocation: sameLocation
        ? undefined
        : { file: match.region.file, startLine: match.region.afterStart, endLine: match.region.afterEnd },
      note: sameLocation
        ? 'The underlying evidence still applies at the same location.'
        : `The underlying evidence still applies; the code appears to have moved to ${match.region.file}:${match.region.afterStart}-${match.region.afterEnd}.`,
    });
  }

  return results;
}

/**
 * Pairs a RESOLVED outcome with a brand-new finding introduced at roughly the
 * same location in the same revision — i.e. "fixed X but introduced Y".
 */
export function pairRegressions(
  reReview: ReReviewResult[],
  previousFindings: ReviewFinding[],
  newFindings: ReviewFinding[],
): RegressionPair[] {
  const pairs: RegressionPair[] = [];
  for (const r of reReview.filter((x) => x.outcome === 'RESOLVED')) {
    const original = previousFindings.find((f) => f.id === r.findingId);
    if (!original?.sourceLocation) continue;
    const collocated = newFindings.find(
      (nf) =>
        nf.sourceLocation?.file === original.sourceLocation!.file &&
        Math.abs(nf.sourceLocation.startLine - original.sourceLocation!.startLine) <= SAME_LOCATION_TOLERANCE,
    );
    if (collocated) {
      pairs.push({
        resolvedFindingId: original.id,
        regressionFindingId: collocated.id,
        note: `Original finding "${original.title}" resolved; new issue introduced by the fix: "${collocated.title}".`,
      });
    }
  }
  return pairs;
}

/**
 * Whether a finding's evidence still holds against the new revision.
 *
 * Complexity findings get a real, absolute re-check: the recorded "bad"
 * nesting depth from when the finding was created is compared against the
 * CURRENT depth in the target file. This matters because the complexity
 * analyzer only emits a signal on a *delta* within a single diff pair — a
 * re-review diffed against an already-bad base would otherwise see "no
 * change" and wrongly conclude the issue vanished, even if it never
 * improved. Categories this engine has no independent way to re-verify
 * (correctness, wired quality/Feature 18) fall back to the caller-supplied
 * stillFailingEvidenceIds — that boundary is intentional: this engine must
 * not reimplement those authoritative sources.
 */
function reconfirmEvidence(finding: ReviewFinding, stillFailingEvidenceIds: Set<string>, targetFiles: SourceFile[]): boolean {
  if (finding.category === 'COMPLEXITY' && finding.sourceLocation) {
    const complexityEvidence = finding.evidence.find((e) => e.source === 'complexity');
    const recordedAfter = (complexityEvidence?.data as { after?: { maxLoopNestingDepth?: number } } | undefined)?.after;
    const target = targetFiles.find((f) => f.path === finding.sourceLocation!.file);
    if (target && recordedAfter?.maxLoopNestingDepth !== undefined) {
      const current = analyzeComplexity(target.content);
      if (current) return current.maxLoopNestingDepth >= recordedAfter.maxLoopNestingDepth;
    }
  }
  return finding.evidence.some((e) => stillFailingEvidenceIds.has(e.id));
}

function bestMatch(snippet: string, regions: DiffRegion[]): { region?: DiffRegion; similarity: number } {
  let best: { region?: DiffRegion; similarity: number } = { region: undefined, similarity: 0 };
  for (const r of regions) {
    const sim = contentSimilarity(snippet, r.afterSnippet || r.beforeSnippet);
    if (sim > best.similarity) best = { region: r, similarity: sim };
  }
  return best.similarity >= MATCH_THRESHOLD ? best : { region: undefined, similarity: best.similarity };
}
