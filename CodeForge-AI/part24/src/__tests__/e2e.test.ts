import { describe, it, expect } from 'vitest';
import { computeDiffRegions } from '../diff/diffEngine';
import { generateFindings } from '../findings/findingEngine';
import { reReviewFindings } from '../review/reReviewEngine';
import { deriveDecision } from '../review/decisionEngine';
import { transition } from '../findings/lifecycle';
import { evaluateDisagreement, suggestedTransitionFor } from '../review/responseEngine';
import type { CorrectnessEvidenceProvider, QualityEvidenceProvider } from '../analysis/evidenceAdapter';

/**
 * Golden scenario, matching the requested end-to-end flow:
 *
 *   base revision -> student submits revision -> diff -> deterministic
 *   analysis -> one high-priority correctness finding -> student responds
 *   -> student disagrees with an optional suggestion -> student fixes the
 *   code -> re-review -> correctness finding resolved, suggestion remains
 *   optional -> decision: APPROVE_WITH_SUGGESTIONS.
 *
 * Every fact asserted below comes from the actual engine functions, not
 * hardcoded expectations — this test would fail if the engine's real
 * behavior changed.
 */
describe('golden scenario: submit -> review -> respond -> disagree -> fix -> re-review -> decision', () => {
  const starter = [{ path: 'solution.js', content: 'function findPair(nums, target) {\n  // TODO: implement\n  return [];\n}\n' }];

  const submission1 = [{
    path: 'solution.js',
    content: [
      'function findPair(nums, target) {',
      '  const m = {};',
      '  for (let i = 0; i < nums.length; i++) {',
      '    const c = target - nums[i];',
      '    if (m[c] !== undefined) return [m[c], i];',
      '    m[nums[i]] = i;',
      '  }',
      '  return [-1, -1];', // bug: spec requires [] when no pair is found
      '}',
      '',
    ].join('\n'),
  }];

  const submission2 = [{
    path: 'solution.js',
    content: [
      'function findPair(nums, target) {',
      '  const m = {};',
      '  for (let i = 0; i < nums.length; i++) {',
      '    const c = target - nums[i];',
      '    if (m[c] !== undefined) return [m[c], i];',
      '    m[nums[i]] = i;',
      '  }',
      '  return [];', // fixed
      '}',
      '',
    ].join('\n'),
  }];

  function correctnessProvider(passing: boolean): CorrectnessEvidenceProvider {
    return {
      async getResult() {
        return passing
          ? { allPassed: true, failing: [], regression: [] }
          : {
              allPassed: false,
              failing: [{ id: 'not-found-case', name: 'returns [] when no pair exists', passed: false, message: 'got [-1,-1], expected []' }],
              regression: [],
            };
      },
    };
  }

  const namingIssue = { rule: 'naming', message: 'Single-letter identifiers (m, c) reduce readability of this block.', file: 'solution.js', startLine: 1, endLine: 9 };
  function qualityProvider(): QualityEvidenceProvider {
    return { async getResult() { return [namingIssue]; } };
  }

  it('runs the full loop and lands on APPROVE_WITH_SUGGESTIONS', async () => {
    // 1. Diff + deterministic analysis on the first submission
    const diff1 = computeDiffRegions(starter, submission1);
    const { findings: findings1, testsPassing: testsPassing1 } = await generateFindings({
      reviewId: 'review-1',
      diffRegions: diff1,
      baseFiles: starter,
      targetFiles: submission1,
      problemContext: { id: 'find-pair', title: 'Find Pair', constraints: { maxInputSize: 1000 } },
      evidenceProviders: { correctness: correctnessProvider(false), quality: qualityProvider() },
      targetRevisionId: 'submission-1',
    });

    const correctnessFinding = findings1.find((f) => f.category === 'CORRECTNESS');
    const namingFinding = findings1.find((f) => f.category === 'MAINTAINABILITY');
    expect(correctnessFinding, 'expected one correctness finding from the failing-test evidence').toBeDefined();
    expect(correctnessFinding!.severity).toBe('BLOCKER');
    expect(correctnessFinding!.priority).toBe('MUST_FIX');
    expect(namingFinding, 'expected one optional naming suggestion from the quality seam').toBeDefined();
    expect(namingFinding!.priority).toBe('CONSIDER');

    // 2. Before any response, the review is correctly blocked
    const initialDecision = deriveDecision(findings1, testsPassing1);
    expect(initialDecision.decision).toBe('BLOCKED');

    // 3. Student responds: FIXED on the correctness finding, DISAGREE on the naming suggestion
    correctnessFinding!.status = transition(correctnessFinding!.status, suggestedTransitionFor('FIXED')!);
    const disagreement = evaluateDisagreement('I disagree, I think single-letter names are fine here.', namingFinding!);
    // No cited evidence in the rebuttal -> finding stays open. That's fine: it
    // was never blocking the decision to begin with (priority CONSIDER).
    expect(disagreement.verdict).toBe('MAINTAIN');

    // 4. Student submits a revision that fixes the bug and leaves naming as-is
    const diff2 = computeDiffRegions(submission1, submission2);
    const { findings: freshFindings, testsPassing: testsPassing2 } = await generateFindings({
      reviewId: 'review-1',
      diffRegions: diff2,
      baseFiles: submission1,
      targetFiles: submission2,
      problemContext: { id: 'find-pair', title: 'Find Pair', constraints: { maxInputSize: 1000 } },
      evidenceProviders: { correctness: correctnessProvider(true), quality: qualityProvider() },
      targetRevisionId: 'submission-2',
    });
    expect(testsPassing2).toBe(true);
    // A one-line bugfix shouldn't introduce any new blocking issue
    expect(freshFindings.some((f) => !f.isPositive && (f.severity === 'BLOCKER' || f.priority === 'MUST_FIX'))).toBe(false);

    // 5. Re-review the two findings carried over from the first pass against the new diff.
    // The correctness test id is no longer failing; the naming evidence id still is.
    const stillFailing = new Set<string>([`quality:${namingIssue.file}:${namingIssue.startLine}`]);
    const reReview = reReviewFindings([correctnessFinding!, namingFinding!], diff2, stillFailing);

    const correctnessOutcome = reReview.find((r) => r.findingId === correctnessFinding!.id)!;
    expect(correctnessOutcome.outcome).toBe('RESOLVED');
    correctnessFinding!.status = transition(correctnessFinding!.status, 'RESOLVED');

    const namingOutcome = reReview.find((r) => r.findingId === namingFinding!.id)!;
    // Still applies — the student chose not to act on it. It may report as
    // STILL_PRESENT or MOVED depending on exact diff-hunk boundaries, but it
    // must never be silently marked RESOLVED or dropped.
    expect(['STILL_PRESENT', 'MOVED']).toContain(namingOutcome.outcome);

    // 6. Final decision: correctness resolved, one optional suggestion remains, tests pass
    const finalFindings = [correctnessFinding!, namingFinding!];
    const finalDecision = deriveDecision(finalFindings, testsPassing2);
    expect(finalDecision.decision).toBe('APPROVE_WITH_SUGGESTIONS');
    expect(finalDecision.readiness).toBe('READY_WITH_SUGGESTIONS');
  });
});
