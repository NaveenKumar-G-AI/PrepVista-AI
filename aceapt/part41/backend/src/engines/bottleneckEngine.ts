import type { StrategyContext, StrategySignal, Bottleneck, BottleneckCategory, BottleneckCandidateScore } from '../types/strategy.js';

function signal(signals: StrategySignal[], code: string): StrategySignal | undefined {
  return signals.find((s) => s.code === code);
}

interface Rule {
  category: BottleneckCategory;
  /** Returns null if the rule doesn't apply at all (missing preconditions —
   * spec #8: "do not assume a bottleneck merely because a metric is low").
   * Returns a score 0..1 (corroboration strength) otherwise. */
  evaluate: (ctx: StrategyContext, signals: StrategySignal[]) => BottleneckCandidateScore | null;
  describe: (ctx: StrategyContext, signals: StrategySignal[]) => {
    description: string;
    whyItMatters: string;
    whatHappensIfIgnored: string;
    recommendedAction: Bottleneck['recommendedAction'];
  };
}

const RULES: Rule[] = [
  {
    category: 'unclear_career_direction',
    evaluate: (_ctx, signals) => {
      const s = signal(signals, 'goal_unclear');
      if (!s) return null;
      return { category: 'unclear_career_direction', score: s.weight, corroboratingSignals: [s.code] };
    },
    describe: () => ({
      description: 'No active target role is set, so nothing downstream (evidence, opportunities, actions) has a clear target to align to.',
      whyItMatters: 'Every other part of the strategy loop needs a target to measure progress against.',
      whatHappensIfIgnored: 'Effort keeps going into activities that may not add up to anything specific.',
      recommendedAction: 'gather_information',
    }),
  },
  {
    category: 'insufficient_technical_evidence',
    evaluate: (_ctx, signals) => {
      const s = signal(signals, 'evidence_gap');
      if (!s || s.weight < 0.3) return null; // require a real gap, not a token one
      const corroborators = [s.code];
      let score = s.weight;
      const shallow = signal(signals, 'portfolio_shallow');
      if (shallow) {
        score = Math.min(1, score + 0.2);
        corroborators.push(shallow.code);
      }
      return { category: 'insufficient_technical_evidence', score, corroboratingSignals: corroborators };
    },
    describe: (_ctx, signals) => {
      const s = signal(signals, 'evidence_gap');
      const missing = (s?.payload?.missing as string[]) ?? [];
      return {
        description: `Evidence doesn't yet cover: ${missing.join(', ') || 'one or more required skills'}.`,
        whyItMatters: 'Recruiters and interviewers judge readiness by demonstrated evidence, not stated skills.',
        whatHappensIfIgnored: 'Applications and interviews keep running into the same credibility gap.',
        recommendedAction: 'build_project',
      };
    },
  },
  {
    category: 'insufficient_application_volume',
    evaluate: (_ctx, signals) => {
      const s = signal(signals, 'application_volume_low');
      if (!s) return null;
      return { category: 'insufficient_application_volume', score: s.weight, corroboratingSignals: [s.code] };
    },
    describe: (_ctx, signals) => ({
      description: signal(signals, 'application_volume_low')?.detail ?? 'Application volume is low relative to available opportunities.',
      whyItMatters: 'Every stage after "apply" depends on there being enough applications in flight to learn from.',
      whatHappensIfIgnored: 'Relevant opportunities pass their deadlines unaddressed.',
      recommendedAction: 'apply_to_opportunity',
    }),
  },
  {
    category: 'poor_interview_performance',
    evaluate: (_ctx, signals) => {
      // Deliberately requires at least one completed interview — otherwise
      // this is "insufficient_application_volume" or "unclear_direction",
      // not an interview-performance problem (spec #10).
      const s = signal(signals, 'interview_conversion_low');
      if (!s) return null;
      return { category: 'poor_interview_performance', score: s.weight, corroboratingSignals: [s.code] };
    },
    describe: (_ctx, signals) => {
      const tagSignal = signal(signals, 'interview_outcome_tags');
      const tagCounts = (tagSignal?.payload?.tagCounts as Record<string, number>) ?? {};
      const cascadeMap: Record<string, { desc: string; action: Bottleneck['recommendedAction'] }> = {
        technical_knowledge_gap: { desc: 'technical depth in interviews', action: 'practice_weak_area' },
        communication_gap: { desc: 'communicating solutions clearly under interview conditions', action: 'practice_weak_area' },
        confidence_gap: { desc: 'confidence during live interviews', action: 'practice_weak_area' },
        resume_mismatch: { desc: 'a mismatch between the resume and what interviewers expect', action: 'fix_resume_evidence' },
        role_mismatch: { desc: 'applying to roles that are not a strong fit', action: 'validate_opportunity' },
      };
      const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
      const top = sortedTags[0];
      if (top && cascadeMap[top[0]]) {
        const { desc, action } = cascadeMap[top[0]]!;
        return {
          description: `Interviews are happening but not converting, most often traced to ${desc}.`,
          whyItMatters: 'Getting interviews and not converting them wastes the opportunities that are hardest to generate.',
          whatHappensIfIgnored: 'The pattern likely repeats across future interviews.',
          recommendedAction: action,
        };
      }
      return {
        description: 'Interviews are happening but not converting, and there isn\u2019t enough detail yet to say why.',
        whyItMatters: 'Getting interviews and not converting them wastes the opportunities that are hardest to generate.',
        whatHappensIfIgnored: 'Without more detail, the same pattern is likely to repeat.',
        recommendedAction: 'gather_information',
      };
    },
  },
  {
    category: 'inadequate_opportunity_targeting',
    evaluate: (_ctx, signals) => {
      const s = signal(signals, 'weak_targeting');
      if (!s) return null;
      return { category: 'inadequate_opportunity_targeting', score: s.weight, corroboratingSignals: [s.code] };
    },
    describe: () => ({
      description: 'Most applications are going to opportunities with low relevance to the stated goal.',
      whyItMatters: 'Volume without relevance rarely converts and costs time that could go to better-fitting opportunities.',
      whatHappensIfIgnored: 'Application effort keeps producing a low response rate.',
      recommendedAction: 'validate_opportunity',
    }),
  },
  {
    category: 'inconsistent_execution',
    evaluate: (_ctx, signals) => {
      const s = signal(signals, 'execution_stalled');
      if (!s) return null;
      return { category: 'inconsistent_execution', score: s.weight, corroboratingSignals: [s.code] };
    },
    describe: (_ctx, signals) => ({
      description: signal(signals, 'execution_stalled')?.detail ?? 'Several planned actions have stalled without completion.',
      whyItMatters: 'A strategy only produces evidence and outcomes once actions are actually completed.',
      whatHappensIfIgnored: 'The backlog of half-started actions keeps growing without new progress.',
      recommendedAction: 'stop_low_value_activity',
    }),
  },
];

/**
 * spec #8-10: BOTTLENECK ENGINE.
 *
 * Evaluates every rule, keeps only the ones with real corroborating evidence,
 * and surfaces exactly one as THE bottleneck (spec #9: single-bottleneck
 * principle) — the rest are kept as runner-ups for transparency in the
 * "Why this?" panel, not shown as a wall of problems.
 */
export function detectPrimaryBottleneck(ctx: StrategyContext, signals: StrategySignal[]): Bottleneck | null {
  const candidates = RULES.map((rule) => rule.evaluate(ctx, signals)).filter((c): c is BottleneckCandidateScore => c !== null && c.score >= 0.3);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0]!;
  const rule = RULES.find((r) => r.category === top.category)!;
  const { description, whyItMatters, whatHappensIfIgnored, recommendedAction } = rule.describe(ctx, signals);

  const severity: Bottleneck['severity'] = top.score >= 0.75 ? 'high' : top.score >= 0.5 ? 'medium' : 'low';

  let cascade: Bottleneck['cascade'] | undefined;
  if (top.category === 'poor_interview_performance') {
    const tagSignal = signal(signals, 'interview_outcome_tags');
    const tagCounts = (tagSignal?.payload?.tagCounts as Record<string, number>) ?? {};
    const investigated = ['technical knowledge', 'communication', 'confidence', 'resume mismatch', 'role mismatch'];
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    cascade = {
      investigated,
      refinedCause: sortedTags[0]?.[0],
      unknowns: sortedTags.length === 0 ? ['No interview feedback tags recorded yet — root cause is not yet distinguishable.'] : [],
    };
  }

  return {
    category: top.category,
    description,
    whyItMatters,
    evidence: top.corroboratingSignals.map((code) => signals.find((s) => s.code === code)?.detail ?? code),
    severity,
    whatHappensIfIgnored,
    recommendedAction,
    cascade,
    runnerUps: candidates.slice(1, 4),
    detectedAt: new Date().toISOString(),
  };
}
