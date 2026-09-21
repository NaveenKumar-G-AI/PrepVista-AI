import type { ReviewFinding, ReviewDecision, ReviewSummaryCounts } from '../domain/types';

const OPEN_STATUSES = new Set(['OPEN', 'REOPENED', 'ACKNOWLEDGED', 'IN_PROGRESS']);

function isOpen(f: ReviewFinding): boolean {
  return !f.isPositive && OPEN_STATUSES.has(f.status);
}

/**
 * Pure, deterministic decision rules. An LLM never arbitrarily decides
 * APPROVE/BLOCKED here — this function only looks at finding severity,
 * priority, and status, plus whether required tests are passing.
 *
 *   any BLOCKER open, or tests failing        -> BLOCKED / BLOCKED
 *   any MUST_FIX open                         -> CHANGES_REQUESTED / NOT_READY
 *   only SHOULD_FIX/CONSIDER/OPTIONAL open     -> APPROVE_WITH_SUGGESTIONS / READY_WITH_SUGGESTIONS
 *   nothing open                              -> APPROVE / READY
 *   correctness evidence not available yet    -> NEEDS_REVIEW / NOT_READY
 */
export function deriveDecision(findings: ReviewFinding[], testsPassing: boolean | null): ReviewDecision {
  const now = new Date().toISOString();
  const open = findings.filter(isOpen);

  if (testsPassing === null) {
    return {
      decision: 'NEEDS_REVIEW',
      readiness: 'NOT_READY',
      rationale: 'Required test/correctness evidence is not yet available for this revision.',
      computedAt: now,
    };
  }

  const blockers = open.filter((f) => f.severity === 'BLOCKER');
  if (blockers.length > 0 || !testsPassing) {
    return {
      decision: 'BLOCKED',
      readiness: 'BLOCKED',
      rationale: !testsPassing
        ? 'Required tests are not passing on this revision.'
        : `${blockers.length} blocker finding(s) remain open: ${blockers.map((b) => b.title).join('; ')}.`,
      computedAt: now,
    };
  }

  const mustFix = open.filter((f) => f.priority === 'MUST_FIX');
  if (mustFix.length > 0) {
    return {
      decision: 'CHANGES_REQUESTED',
      readiness: 'NOT_READY',
      rationale: `${mustFix.length} must-fix finding(s) remain open: ${mustFix.map((f) => f.title).join('; ')}.`,
      computedAt: now,
    };
  }

  const suggestions = open.filter((f) => f.priority === 'SHOULD_FIX' || f.priority === 'CONSIDER' || f.priority === 'OPTIONAL');
  if (suggestions.length > 0) {
    return {
      decision: 'APPROVE_WITH_SUGGESTIONS',
      readiness: 'READY_WITH_SUGGESTIONS',
      rationale: `All must-fix findings are resolved and required tests pass; ${suggestions.length} optional suggestion(s) remain.`,
      computedAt: now,
    };
  }

  return {
    decision: 'APPROVE',
    readiness: 'READY',
    rationale: 'All findings are resolved and required tests pass.',
    computedAt: now,
  };
}

export function summarize(findings: ReviewFinding[], filesChanged: number, linesChanged: number): ReviewSummaryCounts {
  return {
    filesChanged,
    linesChanged,
    blockers: findings.filter((f) => isOpen(f) && f.severity === 'BLOCKER').length,
    highPriority: findings.filter((f) => isOpen(f) && f.priority === 'MUST_FIX').length,
    suggestions: findings.filter((f) => isOpen(f) && ['SHOULD_FIX', 'CONSIDER', 'OPTIONAL'].includes(f.priority)).length,
    positive: findings.filter((f) => f.isPositive).length,
  };
}
