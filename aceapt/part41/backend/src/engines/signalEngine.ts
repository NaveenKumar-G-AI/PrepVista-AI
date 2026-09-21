import type { StrategyContext, StrategySignal, SignalType } from '../types/strategy.js';
import { diffDays, clamp, tempId } from './utils.js';

function mk(type: SignalType, code: string, detail: string, weight: number, payload?: Record<string, unknown>): StrategySignal {
  return { id: tempId('sig'), type, code, detail, weight: clamp(weight), payload, detectedAt: new Date().toISOString() };
}

/**
 * PHASE 3 of the AI pipeline (spec #52, #54): SIGNAL ENGINE.
 *
 * Deterministic, rule-based extraction — no LLM involved. Every signal is
 * traceable to a concrete fact in the context (a count, a ratio, an age in
 * days), never a vibe. Downstream engines (bottleneck, next-best-move,
 * health, momentum) consume these signals rather than re-deriving facts
 * themselves, so there is one place to audit "why did the system think X".
 */
export function extractSignals(ctx: StrategyContext): StrategySignal[] {
  const signals: StrategySignal[] = [];
  const now = new Date(ctx.asOf);

  // --- Direction -----------------------------------------------------------
  if (!ctx.goal) {
    signals.push(mk('uncertainty', 'goal_unclear', 'No active target role is set.', 1));
    return signals; // nothing else is meaningful without a goal
  }

  // --- Evidence gap (spec #8: insufficient_technical_evidence) -------------
  const required = ctx.goal.requiredSkills;
  if (required.length > 0) {
    const covered = new Set(ctx.evidence.filter((e) => e.strength !== 'weak').flatMap((e) => e.skillTags));
    const missing = required.filter((s) => !covered.has(s));
    if (missing.length > 0) {
      const gapRatio = missing.length / required.length;
      signals.push(mk('gap', 'evidence_gap', `No solid evidence yet for: ${missing.join(', ')}.`, gapRatio, { missing }));
    }
  }

  // --- Portfolio depth -------------------------------------------------------
  const strongEvidence = ctx.evidence.filter((e) => e.strength === 'strong');
  if (ctx.evidence.length > 0 && strongEvidence.length === 0) {
    signals.push(mk('gap', 'portfolio_shallow', 'Evidence exists but none of it is rated strong.', 0.5));
  }

  // --- Application volume & conversion (spec #25-27) ------------------------
  const apps = ctx.applications;
  const openRelevantOpportunities = ctx.opportunities.filter((o) => !o.applied && o.relevanceToGoal >= 0.5);
  if (apps.length < 5 && openRelevantOpportunities.length >= 3) {
    signals.push(
      mk(
        'gap',
        'application_volume_low',
        `${apps.length} application(s) submitted while ${openRelevantOpportunities.length} relevant open opportunities exist.`,
        apps.length === 0 ? 1 : 0.6,
      ),
    );
  }

  const decidedApps = apps.filter((a) => a.status !== 'applied');
  const interviews = apps.filter((a) => ['interview', 'offer', 'rejected'].includes(a.status));
  const offers = apps.filter((a) => a.status === 'offer');

  if (interviews.length >= 3) {
    const rate = offers.length / interviews.length;
    if (rate === 0) {
      signals.push(
        mk('risk', 'interview_conversion_low', `${interviews.length} interview(s) recorded with no offers yet.`, 0.8, {
          interviewCount: interviews.length,
        }),
      );
      const tagCounts = new Map<string, number>();
      for (const a of interviews) {
        for (const t of a.outcomeTags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
      if (tagCounts.size > 0) {
        signals.push(
          mk('bottleneck', 'interview_outcome_tags', 'Interview feedback tags are available for root-cause analysis.', 0.4, {
            tagCounts: Object.fromEntries(tagCounts),
          }),
        );
      }
    }
  } else if (apps.length >= 8 && interviews.length === 0) {
    signals.push(mk('risk', 'no_interview_conversion', `${apps.length} applications submitted with zero interviews.`, 0.9));
  }

  if (decidedApps.length >= 4) {
    const lowRelevanceApplied = apps.filter((a) => {
      const opp = ctx.opportunities.find((o) => o.id === a.opportunityId);
      return opp && opp.relevanceToGoal < 0.4;
    });
    if (lowRelevanceApplied.length / decidedApps.length > 0.5) {
      signals.push(
        mk('risk', 'weak_targeting', 'More than half of applications went to opportunities with low relevance to the goal.', 0.6),
      );
    }
  }

  // --- Constraints -----------------------------------------------------------
  const timeConstraint = ctx.constraints.find((c) => c.type === 'time' && c.hoursPerWeek != null);
  if (timeConstraint?.hoursPerWeek != null) {
    signals.push(
      mk('constraint', 'time_budget', `${timeConstraint.hoursPerWeek} hour(s)/week available.`, 0.3, {
        hoursPerWeek: timeConstraint.hoursPerWeek,
      }),
    );
  }

  // --- Strategy staleness (spec #23, #90) -------------------------------------
  if (ctx.currentVersion) {
    const ageDays = diffDays(now, new Date(ctx.currentVersion.createdAt));
    if (ageDays > 45 && ctx.recentOutcomes.length > 0) {
      signals.push(mk('trend', 'stale_strategy', `Strategy has not been updated in ${ageDays} days despite new outcomes.`, 0.5));
    }
  }

  // --- Execution consistency (spec #23, #26) ---------------------------------
  const openActions = ctx.recentActions.filter((a) => ['suggested', 'accepted', 'in_progress'].includes(a.status));
  const staleActions = openActions.filter((a) => diffDays(now, new Date(a.createdAt)) > 21);
  if (staleActions.length >= 2) {
    signals.push(
      mk('risk', 'execution_stalled', `${staleActions.length} planned action(s) have been open for 3+ weeks without completion.`, 0.6, {
        actionIds: staleActions.map((a) => a.id),
      }),
    );
  }

  // --- Deadlines / urgency ----------------------------------------------------
  const soonDeadlines = ctx.opportunities.filter((o) => {
    if (!o.deadline || o.applied) return false;
    const days = diffDays(new Date(o.deadline), now);
    return days >= 0 && days <= 10;
  });
  if (soonDeadlines.length > 0) {
    signals.push(
      mk('opportunity', 'deadline_approaching', `${soonDeadlines.length} relevant opportunity deadline(s) within 10 days.`, 0.7, {
        opportunityIds: soonDeadlines.map((o) => o.id),
      }),
    );
  }

  return signals;
}
