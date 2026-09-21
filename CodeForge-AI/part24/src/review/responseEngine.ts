import type { ResponseType, FindingStatus, ReviewFinding, Evidence } from '../domain/types';

export interface ResponseAssessment {
  hasEvidence: boolean;
  hasReasoningMarkers: boolean;
  hasActionVerb: boolean;
  acknowledgesConcern: boolean;
  qualityScore: number; // 0..1 heuristic signal, not a grade
  signals: string[];
}

export interface DisagreementVerdict {
  verdict: 'RECONSIDER' | 'MAINTAIN';
  rationale: string;
}

const REASONING_MARKERS = [' because ', ' since ', ' given that ', ' due to ', ' as a result', ' which means'];
const ACTION_VERBS = ['replace', 'fix', 'add', 'remove', 'refactor', 'rename', 'extract', 'use ', 'switch to', 'update'];
const ACK_MARKERS = ["you're right", 'you are right', 'good point', 'agreed', "that's fair", 'valid point', 'i see'];

/**
 * A lightweight, explainable heuristic — not a grade on grammar. It looks for
 * the same signals a human reviewer would notice: does the response engage
 * with the actual evidence, reason about it, propose an action, or
 * acknowledge a valid concern. This is deliberately transparent so it can be
 * audited, unlike an opaque LLM score.
 */
export function assessResponse(message: string, finding: Pick<ReviewFinding, 'evidence'>): ResponseAssessment {
  const lower = message.toLowerCase();
  const evidenceTerms = finding.evidence.flatMap(extractKeyTerms);

  const hasEvidence = evidenceTerms.length > 0 && evidenceTerms.some((t) => lower.includes(t.toLowerCase()));
  const hasReasoningMarkers = REASONING_MARKERS.some((m) => lower.includes(m));
  const hasActionVerb = ACTION_VERBS.some((v) => lower.includes(v));
  const acknowledgesConcern = ACK_MARKERS.some((m) => lower.includes(m));

  const signals = [
    hasEvidence && 'evidence-grounded',
    hasReasoningMarkers && 'technical-reasoning',
    hasActionVerb && 'action-oriented',
    acknowledgesConcern && 'acknowledges-concern',
  ].filter((s): s is string => Boolean(s));

  return { hasEvidence, hasReasoningMarkers, hasActionVerb, acknowledgesConcern, qualityScore: signals.length / 4, signals };
}

/**
 * A DISAGREE response is never auto-punished, but it's also never
 * auto-accepted by vibes: reconsideration is only flagged when the student's
 * message ties back to the finding's own evidence with actual reasoning.
 * This first-pass verdict is a gate, not the final word — the AI layer
 * (see ai/providers.ts) can add a deeper, evidence-checked read on top of it,
 * but this deterministic layer is what stands if the AI is unavailable.
 */
export function evaluateDisagreement(message: string, finding: ReviewFinding): DisagreementVerdict {
  const assessment = assessResponse(message, finding);
  if (assessment.hasEvidence && assessment.hasReasoningMarkers) {
    return {
      verdict: 'RECONSIDER',
      rationale: 'Disagreement references the finding\'s own evidence and gives technical reasoning; flagged for reviewer/AI re-check before the finding is downgraded.',
    };
  }
  return {
    verdict: 'MAINTAIN',
    rationale: 'Disagreement does not cite verifiable evidence tied to this finding; it remains open pending a technical justification.',
  };
}

export function suggestedTransitionFor(responseType: ResponseType): FindingStatus | null {
  switch (responseType) {
    case 'ACKNOWLEDGE':
      return 'ACKNOWLEDGED';
    case 'FIXED':
      return 'FIXED';
    case 'WONT_FIX':
      return 'WONT_FIX';
    case 'EXPLAIN':
      return 'IN_PROGRESS';
    case 'REQUEST_CLARIFICATION':
    case 'DISAGREE':
      return null; // no automatic status change; handled by evaluateDisagreement / reviewer follow-up
    default:
      return null;
  }
}

function extractKeyTerms(e: Evidence): string[] {
  const tokens = e.description.match(/[\w()^]+/g) ?? [];
  return tokens.filter((t) => /\d|O\(/.test(t));
}
