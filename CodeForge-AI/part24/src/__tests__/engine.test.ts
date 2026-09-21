import { describe, it, expect } from 'vitest';
import { computeDiffRegions, summarizeDiff } from '../diff/diffEngine';
import { analyzeComplexity, bigOFromDepth } from '../analysis/complexityHeuristic';
import { detectNearDuplicate } from '../analysis/duplicationHeuristic';
import { generateFindings } from '../findings/findingEngine';
import { computeFingerprint, contentSimilarity } from '../findings/fingerprint';
import { transition } from '../findings/lifecycle';

describe('diffEngine', () => {
  it('produces no regions for identical files', () => {
    const files = [{ path: 'a.js', content: 'const x = 1;\n' }];
    expect(computeDiffRegions(files, files)).toHaveLength(0);
  });

  it('detects an added, removed, and modified region', () => {
    const base = [{ path: 'a.js', content: 'function f() {\n  return 1;\n}\n' }];
    const target = [{ path: 'a.js', content: 'function f() {\n  return 2;\n}\n\nfunction g() { return 3; }\n' }];
    const regions = computeDiffRegions(base, target);
    expect(regions.length).toBeGreaterThan(0);
    expect(regions[0].file).toBe('a.js');
  });

  it('never leaks the unified-diff "no newline at end of file" marker into a snippet', () => {
    // Regression test: files with no trailing newline (very common — e.g. a
    // single-line submission) previously polluted beforeSnippet/afterSnippet
    // with a literal " No newline at end of file" line.
    const base = [{ path: 'a.js', content: 'let x = 1;' }]; // no trailing \n
    const target = [{ path: 'a.js', content: 'let x = 2;' }]; // no trailing \n
    const regions = computeDiffRegions(base, target);
    for (const r of regions) {
      expect(r.beforeSnippet).not.toContain('No newline at end of file');
      expect(r.afterSnippet).not.toContain('No newline at end of file');
    }
  });

  it('summarizes files/lines changed', () => {
    const base = [{ path: 'a.js', content: 'let x = 1;\n' }];
    const target = [{ path: 'a.js', content: 'let x = 2;\nlet y = 3;\n' }];
    const summary = summarizeDiff(computeDiffRegions(base, target));
    expect(summary.filesChanged).toBe(1);
    expect(summary.linesChanged).toBeGreaterThan(0);
  });
});

describe('complexityHeuristic', () => {
  it('detects nested-loop complexity regression (O(n) -> O(n^2))', () => {
    const before = `
      function twoSum(nums, target) {
        const seen = {};
        for (let i = 0; i < nums.length; i++) {
          const complement = target - nums[i];
          if (seen[complement] !== undefined) return [seen[complement], i];
          seen[nums[i]] = i;
        }
        return [];
      }
    `;
    const after = `
      function twoSum(nums, target) {
        for (let i = 0; i < nums.length; i++) {
          for (let j = i + 1; j < nums.length; j++) {
            if (nums[i] + nums[j] === target) return [i, j];
          }
        }
        return [];
      }
    `;
    const b = analyzeComplexity(before)!;
    const a = analyzeComplexity(after)!;
    expect(b.maxLoopNestingDepth).toBe(1);
    expect(a.maxLoopNestingDepth).toBe(2);
    expect(bigOFromDepth(b.maxLoopNestingDepth)).toBe('O(n)');
    expect(bigOFromDepth(a.maxLoopNestingDepth)).toBe('O(n^2)');
  });

  it('returns null for unparsable input instead of a false zero', () => {
    expect(analyzeComplexity('def f(x: int) -> int:\n  return x')).toBeNull();
  });
});

describe('duplicationHeuristic', () => {
  it('flags an exact duplicated block', () => {
    const fileLines = [
      'function a() {', '  doWork();', '  doMore();', '  finish();', '}', '',
      'function b() {', '  doWork();', '  doMore();', '  finish();', '}',
    ];
    const newRegion = ['  doWork();', '  doMore();', '  finish();'];
    const result = detectNearDuplicate(newRegion, fileLines, 8, 10);
    expect(result.duplicated).toBe(true);
    expect(result.matchedRange).toEqual({ start: 2, end: 4 });
  });

  it('does not flag unrelated short snippets', () => {
    const fileLines = ['const a = 1;', 'const b = 2;', 'const c = 3;'];
    const result = detectNearDuplicate(['const a = 1;'], fileLines, 1, 1);
    expect(result.duplicated).toBe(false);
  });
});

describe('findingEngine', () => {
  it('generates a HIGH-severity, MUST_FIX complexity finding scoped to problem constraints', async () => {
    const base = [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){}return 0;}' }];
    const target = [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){for(let j=0;j<nums.length;j++){}}return 0;}' }];
    const diffRegions = computeDiffRegions(base, target);
    const { findings, testsPassing } = await generateFindings({
      reviewId: 'r1',
      diffRegions,
      baseFiles: base,
      targetFiles: target,
      problemContext: { id: 'p1', title: 'Two Sum', constraints: { maxInputSize: 100000 } },
      targetRevisionId: 'rev-1',
    });
    expect(testsPassing).toBeNull(); // no correctness provider wired
    const complexityFinding = findings.find((f) => f.category === 'COMPLEXITY' && !f.isPositive);
    expect(complexityFinding).toBeDefined();
    expect(complexityFinding!.severity).toBe('HIGH');
    expect(complexityFinding!.priority).toBe('MUST_FIX');
    expect(complexityFinding!.description).toContain('100,000');
  });

  it('recognizes a positive complexity improvement without inflating priority', async () => {
    const base = [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){for(let j=0;j<nums.length;j++){}}return 0;}' }];
    const target = [{ path: 'sol.js', content: 'const seen={};function f(nums){for(let i=0;i<nums.length;i++){}return 0;}' }];
    const diffRegions = computeDiffRegions(base, target);
    const { findings } = await generateFindings({ reviewId: 'r2', diffRegions, baseFiles: base, targetFiles: target, targetRevisionId: 'rev-2' });
    const positive = findings.find((f) => f.isPositive);
    expect(positive).toBeDefined();
    expect(positive!.priority).toBe('OPTIONAL');
  });

  it('does not fabricate a finding when there is no real signal', async () => {
    const base = [{ path: 'sol.js', content: 'const x = 1;\n' }];
    const target = [{ path: 'sol.js', content: 'const x = 1; // renamed nothing meaningfully\n' }];
    const diffRegions = computeDiffRegions(base, target);
    const { findings } = await generateFindings({ reviewId: 'r3', diffRegions, baseFiles: base, targetFiles: target, targetRevisionId: 'rev-3' });
    expect(findings.filter((f) => !f.isPositive)).toHaveLength(0);
  });
});

describe('fingerprint', () => {
  it('is stable for identical normalized content regardless of whitespace', () => {
    const a = computeFingerprint('COMPLEXITY', '  for (let i=0;i<n;i++) {}  ', 'a.js');
    const b = computeFingerprint('COMPLEXITY', 'for (let i=0;i<n;i++) {}', 'a.js');
    expect(a).toBe(b);
  });

  it('differs across categories for the same snippet', () => {
    const a = computeFingerprint('COMPLEXITY', 'for (let i=0;i<n;i++) {}', 'a.js');
    const b = computeFingerprint('READABILITY', 'for (let i=0;i<n;i++) {}', 'a.js');
    expect(a).not.toBe(b);
  });

  it('contentSimilarity recognizes moved-but-identical code as highly similar', () => {
    const snippet = 'for (let i = 0; i < nums.length; i++) { seen[nums[i]] = i; }';
    expect(contentSimilarity(snippet, snippet)).toBeGreaterThan(0.99);
    expect(contentSimilarity(snippet, 'const totallyUnrelated = fetch(url);')).toBeLessThan(0.3);
  });
});

describe('lifecycle', () => {
  it('allows OPEN -> ACKNOWLEDGED -> FIXED -> RESOLVED', () => {
    let status = transition('OPEN', 'ACKNOWLEDGED');
    status = transition(status, 'FIXED');
    status = transition(status, 'RESOLVED');
    expect(status).toBe('RESOLVED');
  });

  it('rejects illegal transitions, e.g. jumping straight to SUPERSEDED from RESOLVED', () => {
    expect(() => transition('RESOLVED', 'SUPERSEDED')).toThrowError(/Illegal finding transition/);
  });
});
