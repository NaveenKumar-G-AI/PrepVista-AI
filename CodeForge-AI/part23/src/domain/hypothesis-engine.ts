// ============================================================================
// Hypothesis engine (Sections 10-14)
// ============================================================================
// Quality scoring here is a deterministic heuristic — it is the fallback
// used when AI is unavailable (Section 42: "Hypotheses -> work") and a
// sanity pre-filter on AI-assisted refinement when AI is available. It is
// intentionally conservative: it rewards specificity/testability/evidence
// connection/falsifiability, matching Section 11's four listed dimensions
// ("scope" is folded into specificity: an overly broad statement scores the
// same as an unspecific one on that axis).
// ============================================================================

import { Hypothesis, HypothesisQualityScore, HypothesisStatus, clamp01, newId, nowIso } from "../types.js";

const VAGUE_PATTERN = /\b(something|somewhere|stuff|things?|it doesn'?t work|not working|is (wrong|broken|off))\b/i;
const HEDGE_PATTERN = /\b(maybe|possibly|might just be|i guess|not sure|somehow|in general)\b/i;
const CLAIM_PATTERN =
  /\b(because|causes?|when|if|before|after|instead of|off by|returns?|equals?|should|terminates?|never|always|fails? to)\b/i;
const CODE_TOKEN_PATTERN = /[a-zA-Z_][A-Za-z0-9_]*(\[|\(|\.\w)|`[^`]+`/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsAnyToken(statement: string, tokens: string[]): boolean {
  return tokens.some((t) => t.length > 0 && new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(statement));
}

/**
 * Deterministic quality heuristic (Section 11). `knownEvidenceTokens` should
 * be variable/function/location names actually present in the session's
 * evidence bundle (trace variables, failure.sourceLocation.symbol, etc.) —
 * never invented — so evidenceConnection reflects a real overlap, not a
 * guess.
 */
export function scoreHypothesisHeuristically(statement: string, knownEvidenceTokens: string[] = []): HypothesisQualityScore {
  const s = statement.trim();
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  const isVague = VAGUE_PATTERN.test(s);
  const isHedged = HEDGE_PATTERN.test(s);
  const hasClaim = CLAIM_PATTERN.test(s);
  const mentionsEvidence = knownEvidenceTokens.length > 0 && mentionsAnyToken(s, knownEvidenceTokens);

  let specificity = 0.25;
  if (wordCount >= 6) specificity += 0.15;
  if (wordCount >= 10) specificity += 0.1;
  if (!isVague) specificity += 0.25;
  if (CODE_TOKEN_PATTERN.test(s)) specificity += 0.15;
  if (mentionsEvidence) specificity += 0.2;
  specificity = clamp01(specificity);

  let testability = hasClaim ? 0.55 : 0.3;
  if (/\?\s*$/.test(s)) testability -= 0.25;
  if (isVague) testability -= 0.15;
  testability = clamp01(testability);

  const evidenceConnection = clamp01(mentionsEvidence ? 0.8 : 0.15);

  let falsifiability = isHedged ? 0.25 : 0.55;
  if (hasClaim && !isHedged) falsifiability += 0.2;
  falsifiability = clamp01(falsifiability);

  const overall = clamp01(0.3 * specificity + 0.25 * testability + 0.2 * evidenceConnection + 0.25 * falsifiability);

  return { specificity, testability, evidenceConnection, falsifiability, overall };
}

/**
 * Returns a Socratic refinement question when the hypothesis is weak, or
 * `undefined` when it's already specific/testable enough to move to TESTING.
 * Section 14: move broad -> specific -> testable "without prematurely
 * revealing the answer" — so this never names the suspected root cause.
 */
export function refinementQuestion(quality: HypothesisQualityScore): string | undefined {
  if (quality.overall >= 0.5) return undefined;
  if (quality.specificity < 0.4) {
    return "Can you point to one specific variable, function, or line you suspect — rather than the code in general?";
  }
  if (quality.testability < 0.35) {
    return "If you're right, what observation would you expect to see? If you're wrong, what would you see instead?";
  }
  if (quality.evidenceConnection < 0.3) {
    return "What have you actually observed so far that points you toward this, specifically?";
  }
  return "Can you state that as one specific, checkable claim about a single value or operation?";
}

export function createHypothesis(statement: string, knownEvidenceTokens: string[] = [], distinguishingTargets?: string[]): Hypothesis {
  const now = nowIso();
  return {
    id: newId(),
    statement,
    status: HypothesisStatus.PROPOSED,
    quality: scoreHypothesisHeuristically(statement, knownEvidenceTokens),
    distinguishingTargets,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle (Section 12)
// ---------------------------------------------------------------------------

const VALID_HYPOTHESIS_TRANSITIONS: Record<HypothesisStatus, HypothesisStatus[]> = {
  [HypothesisStatus.PROPOSED]: [HypothesisStatus.TESTING, HypothesisStatus.ABANDONED],
  [HypothesisStatus.TESTING]: [
    HypothesisStatus.SUPPORTED,
    HypothesisStatus.REJECTED,
    HypothesisStatus.INCONCLUSIVE,
    HypothesisStatus.ABANDONED,
  ],
  [HypothesisStatus.SUPPORTED]: [],
  [HypothesisStatus.REJECTED]: [],
  [HypothesisStatus.INCONCLUSIVE]: [HypothesisStatus.TESTING, HypothesisStatus.ABANDONED],
  [HypothesisStatus.ABANDONED]: [],
};

export function canTransitionHypothesis(from: HypothesisStatus, to: HypothesisStatus): boolean {
  return VALID_HYPOTHESIS_TRANSITIONS[from].includes(to);
}

export function transitionHypothesis(h: Hypothesis, to: HypothesisStatus, resolutionEvidence?: string): Hypothesis {
  if (!canTransitionHypothesis(h.status, to)) {
    throw new Error(`Invalid hypothesis transition: ${h.status} -> ${to}`);
  }
  const now = nowIso();
  const isTerminal = to === HypothesisStatus.SUPPORTED || to === HypothesisStatus.REJECTED || to === HypothesisStatus.ABANDONED;
  return {
    ...h,
    status: to,
    updatedAt: now,
    resolvedAt: isTerminal ? now : h.resolvedAt,
    resolutionEvidence: resolutionEvidence ?? h.resolutionEvidence,
  };
}

/**
 * Section 11: "Do not penalize a student merely because a reasonable
 * hypothesis turns out to be false." A well-formed hypothesis (quality
 * overall >= 0.5 at time of proposal) that ends REJECTED via real testing is
 * good debugging behavior, not a mistake — consumed by skill-signals.ts so
 * it doesn't drag down hypothesisQuality just for being wrong.
 */
export function wasGoodFaithRejection(h: Hypothesis): boolean {
  return h.status === HypothesisStatus.REJECTED && (h.quality?.overall ?? 0) >= 0.5 && !!h.resolutionEvidence;
}

// ---------------------------------------------------------------------------
// Multiple competing hypotheses (Section 13)
// ---------------------------------------------------------------------------

export interface DistinguishingTarget {
  target: string;
  hypothesisIds: string[];
}

/**
 * Finds the target (variable/location) shared by the most live hypotheses —
 * i.e. the single observation that would do the most to separate competing
 * explanations. Returns undefined if no target is shared by 2+ live
 * hypotheses (nothing to distinguish yet).
 */
export function selectDistinguishingTarget(hypotheses: Hypothesis[]): DistinguishingTarget | undefined {
  const live = hypotheses.filter((h) => h.status === HypothesisStatus.PROPOSED || h.status === HypothesisStatus.TESTING);
  const counts = new Map<string, string[]>();
  for (const h of live) {
    for (const t of h.distinguishingTargets ?? []) {
      const arr = counts.get(t) ?? [];
      arr.push(h.id);
      counts.set(t, arr);
    }
  }
  let best: DistinguishingTarget | undefined;
  for (const [target, hypothesisIds] of counts) {
    if (hypothesisIds.length >= 2 && (!best || hypothesisIds.length > best.hypothesisIds.length)) {
      best = { target, hypothesisIds };
    }
  }
  return best;
}
