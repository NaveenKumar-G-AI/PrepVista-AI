import type {
  StrategyContext,
  StrategySignal,
  Bottleneck,
  NextBestMove,
  NextMoveCandidateScore,
  NextMoveKind,
  ValueFactors,
  ValueTier,
} from '../types/strategy.js';
import { clamp } from './utils.js';
import { estimateEffortHours, flagConstraintViolations } from './guardEngines.js';

function tier(score: number): ValueTier {
  if (score >= 0.62) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}

/**
 * spec #7: VALUE = Impact × Relevance × Confidence × Urgency, adjusted down
 * by Effort + Risk + Opportunity Cost. Internally a 0..1 float; the UI is
 * only ever shown the resulting tier (spec: "do not expose fake mathematical
 * precision"), never this number.
 */
function score(factors: ValueFactors): number {
  const upside = factors.impact * factors.relevance * factors.confidence * factors.urgency;
  const drag = 0.4 * factors.effort + 0.3 * factors.risk + 0.3 * factors.opportunityCost;
  return clamp(upside - drag * upside);
}

function findSignal(signals: StrategySignal[], code: string) {
  return signals.find((s) => s.code === code);
}

function effortFactor(kind: NextMoveKind, availableHoursPerWeek: number | null): number {
  const hours = estimateEffortHours(kind);
  if (availableHoursPerWeek == null || availableHoursPerWeek <= 0) return clamp(hours / 10);
  return clamp(hours / availableHoursPerWeek);
}

type Generator = (ctx: StrategyContext, signals: StrategySignal[], bottleneck: Bottleneck | null) => NextMoveCandidateScore | null;

const availableHours = (ctx: StrategyContext) => ctx.constraints.find((c) => c.type === 'time')?.hoursPerWeek ?? null;

const GENERATORS: Generator[] = [
  // apply_to_opportunity
  (ctx, signals, bottleneck) => {
    const openRelevant = ctx.opportunities.filter((o) => !o.applied && o.relevanceToGoal >= 0.5);
    if (openRelevant.length === 0) return null;
    const best = [...openRelevant].sort((a, b) => b.relevanceToGoal - a.relevanceToGoal)[0]!;
    const deadlineSignal = findSignal(signals, 'deadline_approaching');
    const factors: ValueFactors = {
      impact: 0.7,
      relevance: best.relevanceToGoal,
      confidence: 0.75,
      urgency: deadlineSignal ? 0.9 : 0.5,
      effort: effortFactor('apply_to_opportunity', availableHours(ctx)),
      risk: 0.1,
      opportunityCost: 0.15,
    };
    return {
      kind: 'apply_to_opportunity',
      title: `Apply to "${best.title}"`,
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: `This is the highest-relevance open opportunity (${Math.round(best.relevanceToGoal * 100)}% match)${deadlineSignal ? ', and its deadline is close.' : '.'}`,
      evidence: [`Relevance to goal: ${Math.round(best.relevanceToGoal * 100)}%`],
      violatesConstraints: false,
      targetId: best.id,
    };
  },
  // prepare_for_interview
  (ctx, _signals, bottleneck) => {
    const activeInterview = ctx.applications.find((a) => a.status === 'interview');
    if (!activeInterview) return null;
    const factors: ValueFactors = {
      impact: 0.85,
      relevance: 0.9,
      confidence: 0.7,
      urgency: 0.85,
      effort: effortFactor('prepare_for_interview', availableHours(ctx)),
      risk: 0.15,
      opportunityCost: 0.2,
    };
    return {
      kind: 'prepare_for_interview',
      title: 'Prepare for your upcoming interview',
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: 'An interview is already scheduled — preparation directly affects whether it converts.',
      evidence: ['1 application currently at the interview stage'],
      violatesConstraints: false,
      targetId: activeInterview.id,
    };
  },
  // build_project (evidence bottleneck)
  (ctx, signals, bottleneck) => {
    if (bottleneck?.category !== 'insufficient_technical_evidence') return null;
    const gap = findSignal(signals, 'evidence_gap');
    const factors: ValueFactors = {
      impact: 0.75,
      relevance: 0.85,
      confidence: 0.6,
      urgency: 0.4,
      effort: effortFactor('build_project', availableHours(ctx)),
      risk: 0.2,
      opportunityCost: 0.25,
    };
    return {
      kind: 'build_project',
      title: 'Build a project that demonstrates the missing skill(s)',
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: 'This directly closes the evidence gap identified as the current bottleneck.',
      evidence: gap ? [gap.detail] : [],
      violatesConstraints: false,
    };
  },
  // fix_resume_evidence (resume mismatch cascade)
  (ctx, signals, bottleneck) => {
    if (bottleneck?.category !== 'poor_interview_performance' || bottleneck.cascade?.refinedCause !== 'resume_mismatch') return null;
    const factors: ValueFactors = {
      impact: 0.65,
      relevance: 0.8,
      confidence: 0.65,
      urgency: 0.5,
      effort: effortFactor('fix_resume_evidence', availableHours(ctx)),
      risk: 0.1,
      opportunityCost: 0.1,
    };
    return {
      kind: 'fix_resume_evidence',
      title: 'Align resume evidence with the roles being interviewed for',
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: 'Interview feedback most often points to a resume/role mismatch.',
      evidence: ['Interview outcome tags most frequently flag resume mismatch'],
      violatesConstraints: false,
    };
  },
  // practice_weak_area (technical/communication/confidence cascade)
  (ctx, signals, bottleneck) => {
    if (bottleneck?.category !== 'poor_interview_performance') return null;
    const cause = bottleneck.cascade?.refinedCause;
    if (!cause || !['technical_knowledge_gap', 'communication_gap', 'confidence_gap'].includes(cause)) return null;
    const factors: ValueFactors = {
      impact: 0.7,
      relevance: 0.8,
      confidence: 0.6,
      urgency: 0.55,
      effort: effortFactor('practice_weak_area', availableHours(ctx)),
      risk: 0.15,
      opportunityCost: 0.15,
    };
    return {
      kind: 'practice_weak_area',
      title: `Practice mock interviews focused on ${cause.replace(/_/g, ' ')}`,
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: `Interview feedback most often points to ${cause.replace(/_/g, ' ')}.`,
      evidence: ['Interview outcome tags'],
      violatesConstraints: false,
    };
  },
  // gather_information (unclear direction, or unresolved cascade)
  (ctx, _signals, bottleneck) => {
    const needsInfo =
      bottleneck?.category === 'unclear_career_direction' ||
      (bottleneck?.category === 'poor_interview_performance' && !bottleneck.cascade?.refinedCause);
    if (!needsInfo) return null;
    const factors: ValueFactors = {
      impact: 0.6,
      relevance: 0.9,
      confidence: 0.8,
      urgency: 0.5,
      effort: effortFactor('gather_information', availableHours(ctx)),
      risk: 0.05,
      opportunityCost: 0.05,
    };
    const title =
      bottleneck?.category === 'unclear_career_direction'
        ? 'Clarify your target role before committing more effort'
        : 'Capture interview feedback so root cause is identifiable';
    return {
      kind: 'gather_information',
      title,
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: 'The highest-value next step is information, not more action — acting further would be guessing.',
      evidence: [],
      violatesConstraints: false,
    };
  },
  // validate_opportunity (weak targeting / role mismatch)
  (ctx, _signals, bottleneck) => {
    if (bottleneck?.category !== 'inadequate_opportunity_targeting' && bottleneck?.cascade?.refinedCause !== 'role_mismatch') return null;
    const factors: ValueFactors = {
      impact: 0.55,
      relevance: 0.75,
      confidence: 0.55,
      urgency: 0.3,
      effort: effortFactor('validate_opportunity', availableHours(ctx)),
      risk: 0.1,
      opportunityCost: 0.1,
    };
    return {
      kind: 'validate_opportunity',
      title: 'Re-check which opportunities are genuinely a fit before applying further',
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: 'Applications have been going to opportunities with weak fit — validating fit first raises the value of every application after.',
      evidence: [],
      violatesConstraints: false,
    };
  },
  // apply volume push (insufficient_application_volume, no single opportunity stands out)
  (ctx, signals, bottleneck) => {
    if (bottleneck?.category !== 'insufficient_application_volume') return null;
    const s = findSignal(signals, 'application_volume_low');
    const factors: ValueFactors = {
      impact: 0.7,
      relevance: 0.8,
      confidence: 0.7,
      urgency: 0.6,
      effort: effortFactor('apply_to_opportunity', availableHours(ctx)),
      risk: 0.1,
      opportunityCost: 0.15,
    };
    return {
      kind: 'apply_to_opportunity',
      title: 'Apply to more of the relevant open opportunities',
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: s?.detail ?? 'Application volume is low relative to what is available.',
      evidence: s ? [s.detail] : [],
      violatesConstraints: false,
    };
  },
  // stop_low_value_activity (execution stalled)
  (ctx, signals, bottleneck) => {
    const s = findSignal(signals, 'execution_stalled');
    if (!s || bottleneck?.category !== 'inconsistent_execution') return null;
    const factors: ValueFactors = {
      impact: 0.5,
      relevance: 0.6,
      confidence: 0.7,
      urgency: 0.4,
      effort: 0,
      risk: 0.05,
      opportunityCost: 0,
    };
    return {
      kind: 'stop_low_value_activity',
      title: 'Close out or drop the actions that have stalled for 3+ weeks',
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: s.detail,
      evidence: [s.detail],
      violatesConstraints: false,
    };
  },
  // wait_and_monitor (fallback when nothing else clears the bar and data is thin)
  (ctx, _signals, bottleneck) => {
    if (bottleneck) return null; // only offer this when there's genuinely nothing more useful to do
    const factors: ValueFactors = { impact: 0.3, relevance: 0.5, confidence: 0.5, urgency: 0.3, effort: 0, risk: 0, opportunityCost: 0 };
    return {
      kind: 'wait_and_monitor',
      title: 'Keep executing the current plan and monitor for new signals',
      applicable: true,
      factors,
      rawScore: score(factors),
      tier: tier(score(factors)),
      reasoning: 'No corroborated bottleneck or urgent opportunity stands out right now.',
      evidence: [],
      violatesConstraints: false,
    };
  },
];

export function generateCandidates(ctx: StrategyContext, signals: StrategySignal[], bottleneck: Bottleneck | null): NextMoveCandidateScore[] {
  const raw = GENERATORS.map((g) => g(ctx, signals, bottleneck)).filter((c): c is NextMoveCandidateScore => c !== null);
  const alreadyPlanned = ctx.recentActions.filter((a) => a.status === 'accepted' || a.status === 'in_progress').map((a) => a.kind);
  return flagConstraintViolations(raw, ctx, alreadyPlanned);
}

/**
 * spec #6-7, #47: NEXT BEST MOVE.
 * Picks the highest-scoring candidate that doesn't violate constraints,
 * keeps the next two as alternatives for the "Why this?" panel, and notes
 * if the theoretical best move had to be skipped because it doesn't fit the
 * student's stated capacity (spec #38).
 */
export function determineNextBestMove(ctx: StrategyContext, signals: StrategySignal[], bottleneck: Bottleneck | null): NextBestMove | null {
  const candidates = generateCandidates(ctx, signals, bottleneck);
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => b.rawScore - a.rawScore);
  const feasible = ranked.filter((c) => !c.violatesConstraints);
  const top = feasible[0] ?? ranked[0]!;
  const blockedByConstraints = feasible.length === 0 && ranked.length > 0;

  const alternatives = ranked
    .filter((c) => c.kind !== top.kind)
    .slice(0, 2)
    .map((c) => ({ kind: c.kind, title: c.title, tier: c.tier }));

  return {
    kind: top.kind,
    title: top.title,
    tier: top.tier,
    reasoning: top.reasoning,
    evidence: top.evidence,
    alternatives,
    requiresConfirmation: top.kind === 'change_strategy',
    targetId: top.targetId,
    blockedByConstraints,
  };
}
