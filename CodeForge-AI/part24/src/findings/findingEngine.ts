import { randomUUID } from 'crypto';
import type {
  DiffRegion,
  ReviewFinding,
  Evidence,
  FindingCategory,
  Severity,
  Priority,
  Confidence,
  ProblemContext,
  SourceFile,
} from '../domain/types';
import { analyzeComplexity, bigOFromDepth } from '../analysis/complexityHeuristic';
import { detectNearDuplicate } from '../analysis/duplicationHeuristic';
import { computeFingerprint } from './fingerprint';
import type { EvidenceProviders } from '../analysis/evidenceAdapter';

export interface GenerateFindingsInput {
  reviewId: string;
  diffRegions: DiffRegion[];
  baseFiles: SourceFile[];
  targetFiles: SourceFile[];
  problemContext?: ProblemContext;
  evidenceProviders?: EvidenceProviders;
  targetRevisionId: string;
}

export interface GenerateFindingsOutput {
  findings: ReviewFinding[];
  /** null = no correctness evidence available yet (NEEDS_REVIEW), not "passing" */
  testsPassing: boolean | null;
}

interface RawSignal {
  category: FindingCategory;
  severity: Severity;
  priority: Priority;
  confidence: Confidence;
  title: string;
  description: string;
  whyItMatters: string;
  evidence: Evidence[];
  region?: DiffRegion;
  sourceLocationOverride?: { file: string; startLine: number; endLine: number };
  snippetOverride?: string;
  isPositive?: boolean;
}

export async function generateFindings(input: GenerateFindingsInput): Promise<GenerateFindingsOutput> {
  const raw: RawSignal[] = [];
  let testsPassing: boolean | null = null;

  // ---- 1. Correctness (Feature 16 — authoritative when wired) ----
  if (input.evidenceProviders?.correctness) {
    const result = await input.evidenceProviders.correctness.getResult(input.targetRevisionId);
    if (result) {
      testsPassing = result.allPassed;
      for (const t of result.failing) {
        raw.push({
          category: 'CORRECTNESS',
          severity: 'BLOCKER',
          priority: 'MUST_FIX',
          confidence: 'HIGH',
          title: `Failing test: ${t.name}`,
          description: `Test "${t.name}" fails against this revision${t.message ? `: ${t.message}` : '.'}`,
          whyItMatters: 'A failing test means the change does not satisfy a verified requirement and cannot be merged as-is.',
          evidence: [
            { source: 'correctness', id: `test:${t.id}`, description: `${t.name} failed`, deterministic: true, data: { testId: t.id } },
          ],
        });
      }
      for (const t of result.regression) {
        raw.push({
          category: 'REGRESSION',
          severity: 'BLOCKER',
          priority: 'MUST_FIX',
          confidence: 'HIGH',
          title: `Regression: ${t.name}`,
          description: `Previously passing test "${t.name}" now fails on this revision.`,
          whyItMatters: 'This change breaks behavior that was previously verified correct.',
          evidence: [
            { source: 'correctness', id: `regression:${t.id}`, description: `${t.name} regressed`, deterministic: true, data: { testId: t.id } },
          ],
        });
      }
    }
  }

  // ---- 2. Complexity (Feature 17 seam; falls back to the local heuristic) ----
  for (const region of input.diffRegions) {
    const target = input.targetFiles.find((f) => f.path === region.file);
    const base = input.baseFiles.find((f) => f.path === region.file);
    if (!target) continue;

    const after = analyzeComplexity(target.content);
    const before = base ? analyzeComplexity(base.content) : null;
    if (!after || !before) continue;

    if (after.maxLoopNestingDepth > before.maxLoopNestingDepth) {
      const maxN = readMaxInputSize(input.problemContext);
      const constraintNote = maxN ? ` The problem allows inputs up to ${maxN.toLocaleString()}.` : '';
      const highImpact = maxN !== undefined && maxN > 10_000;
      raw.push({
        category: 'COMPLEXITY',
        severity: highImpact ? 'HIGH' : 'MEDIUM',
        priority: highImpact ? 'MUST_FIX' : 'SHOULD_FIX',
        confidence: 'HIGH',
        title: `Complexity regression: ${bigOFromDepth(before.maxLoopNestingDepth)} → ${bigOFromDepth(after.maxLoopNestingDepth)}`,
        description: `Loop nesting in ${region.file} increased from depth ${before.maxLoopNestingDepth} to ${after.maxLoopNestingDepth}, changing the estimated complexity from ${bigOFromDepth(before.maxLoopNestingDepth)} to ${bigOFromDepth(after.maxLoopNestingDepth)}.${constraintNote}`,
        whyItMatters: 'Higher-order growth can turn a fast solution into one that times out as input size grows.',
        evidence: [
          {
            source: 'complexity',
            id: `complexity:${region.file}`,
            description: `nesting depth ${before.maxLoopNestingDepth} -> ${after.maxLoopNestingDepth}`,
            deterministic: true,
            data: { before, after },
          },
        ],
        region,
      });
    } else if (after.maxLoopNestingDepth < before.maxLoopNestingDepth) {
      raw.push({
        category: 'COMPLEXITY',
        severity: 'INFO',
        priority: 'OPTIONAL',
        confidence: 'HIGH',
        isPositive: true,
        title: `Complexity improved: ${bigOFromDepth(before.maxLoopNestingDepth)} → ${bigOFromDepth(after.maxLoopNestingDepth)}`,
        description: `Loop nesting in ${region.file} decreased from depth ${before.maxLoopNestingDepth} to ${after.maxLoopNestingDepth}.`,
        whyItMatters: 'Reduced growth rate improves performance headroom as inputs scale.',
        evidence: [
          { source: 'complexity', id: `complexity-improve:${region.file}`, description: 'nesting depth decreased', deterministic: true },
        ],
        region,
      });
    }
  }

  // ---- 3. Duplication (local heuristic; Feature 18 seam covers the rest) ----
  for (const region of input.diffRegions) {
    if (region.kind === 'removed') continue;
    const target = input.targetFiles.find((f) => f.path === region.file);
    if (!target) continue;

    const fileLines = target.content.split('\n');
    const regionLines = region.afterSnippet.split('\n');
    const dup = detectNearDuplicate(regionLines, fileLines, region.afterStart, region.afterEnd);
    if (dup.duplicated) {
      raw.push({
        category: 'DUPLICATION',
        severity: 'LOW',
        priority: 'CONSIDER',
        confidence: dup.similarity >= 0.95 ? 'HIGH' : 'MEDIUM',
        title: 'Duplicated logic introduced',
        description: `Lines ${region.afterStart}-${region.afterEnd} in ${region.file} closely match lines ${dup.matchedRange?.start}-${dup.matchedRange?.end} in the same file (${Math.round(dup.similarity * 100)}% line similarity).`,
        whyItMatters: 'Duplicated logic can drift apart over time if only one copy gets updated later.',
        evidence: [
          { source: 'quality', id: `dup:${region.file}:${region.afterStart}`, description: `${Math.round(dup.similarity * 100)}% similarity`, deterministic: true },
        ],
        region,
      });
    }
  }

  // ---- 4. Quality findings from the wired Feature 18 engine, scoped to the diff ----
  if (input.evidenceProviders?.quality) {
    const qualityFindings = await input.evidenceProviders.quality.getResult(input.targetRevisionId);
    for (const qf of qualityFindings) {
      const touchesChange = input.diffRegions.some(
        (r) => r.file === qf.file && rangesOverlap(r.afterStart, r.afterEnd, qf.startLine, qf.endLine),
      );
      if (!touchesChange) continue; // don't surface pre-existing issues outside the diff
      const targetFile = input.targetFiles.find((f) => f.path === qf.file);
      const snippetOverride = targetFile ? targetFile.content.split('\n').slice(qf.startLine - 1, qf.endLine).join('\n') : undefined;
      raw.push({
        category: 'MAINTAINABILITY',
        severity: 'LOW',
        priority: 'CONSIDER',
        confidence: 'MEDIUM',
        title: qf.rule,
        description: qf.message,
        whyItMatters: 'Flagged by the existing code-quality analysis on lines touched by this change.',
        evidence: [{ source: 'quality', id: `quality:${qf.file}:${qf.startLine}`, description: qf.message, deterministic: true }],
        sourceLocationOverride: { file: qf.file, startLine: qf.startLine, endLine: qf.endLine },
        snippetOverride,
      });
    }
  }

  return { findings: consolidate(raw, input.reviewId), testsPassing };
}

function readMaxInputSize(ctx?: ProblemContext): number | undefined {
  const v = ctx?.constraints?.maxInputSize;
  return typeof v === 'number' ? v : undefined;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function severityRank(s: Severity): number {
  return { BLOCKER: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 }[s];
}

/**
 * Consolidates raw signals that point at the same underlying issue (same
 * category + same changed region) into a single finding backed by multiple
 * evidence entries, instead of emitting repetitive comments.
 */
function consolidate(raw: RawSignal[], reviewId: string): ReviewFinding[] {
  const now = new Date().toISOString();
  const groups = new Map<string, RawSignal[]>();

  for (const s of raw) {
    const file = s.region?.file ?? s.sourceLocationOverride?.file ?? 'n/a';
    const line = s.region?.afterStart ?? s.sourceLocationOverride?.startLine ?? 0;
    const key = `${s.category}::${file}::${line}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const findings: ReviewFinding[] = [];
  for (const group of groups.values()) {
    const primary = group.reduce((worst, s) => (severityRank(s.severity) > severityRank(worst.severity) ? s : worst), group[0]);
    const evidence = group.flatMap((s) => s.evidence);
    const loc = primary.region
      ? { file: primary.region.file, startLine: primary.region.afterStart, endLine: primary.region.afterEnd }
      : primary.sourceLocationOverride;
    const snippet = primary.region?.afterSnippet ?? primary.snippetOverride ?? '';

    findings.push({
      id: randomUUID(),
      reviewId,
      category: primary.category,
      severity: primary.severity,
      priority: primary.priority,
      confidence: primary.confidence,
      title: primary.title,
      description: group.length > 1 ? `${primary.description} (confirmed by ${group.length} independent signals.)` : primary.description,
      whyItMatters: primary.whyItMatters,
      evidence,
      sourceLocation: loc,
      sourceSnippet: snippet,
      status: 'OPEN',
      fingerprint: computeFingerprint(primary.category, snippet || primary.title, loc?.file),
      isPositive: Boolean(primary.isPositive),
      createdAt: now,
      updatedAt: now,
    });
  }
  return findings;
}
