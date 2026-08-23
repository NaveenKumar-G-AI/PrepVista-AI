// modules/proactive/detectors/positive.ts
//
// Sections 39/74 — the engine also has to notice when things are going
// well. Same evidence discipline as every risk detector: every number
// here is counted, and nothing is asserted without a real comparison
// behind it (trend + baseline, both from services/anomaly).

import type { Detector, DetectorContext } from '../detectorFramework';
import type { SignalCandidate } from '../../../services/signals/types';
import { compareToBaseline, detectTrend } from '../../../services/anomaly/anomalyEngine';

export const applicationRateImproved: Detector = {
  signalType: 'APPLICATION_RATE_IMPROVED',
  triggeredByEvents: ['APPLICATION_SUBMITTED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const series = await ctx.dataSource.getApplicationRateTrend(ctx.institutionId, ctx.seasonId);
    if (series.length < 3) return [];
    if (detectTrend(series.map((s) => ({ date: s.date, value: s.rate }))) !== 'IMPROVEMENT') return [];

    const first = series[0].rate;
    const last = series[series.length - 1].rate;
    const comparison = compareToBaseline(last, first, { minimumPercentDelta: 5 });
    if (!comparison.isNotable) return [];

    return [
      {
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'APPLICATION_RATE_IMPROVED',
        category: 'APPLICATION',
        polarity: 'POSITIVE',
        entityType: 'SEASON',
        entityId: ctx.seasonId,
        title: `Application conversion improved ${Math.abs(Math.round(comparison.percentDelta ?? 0))}%`,
        summary: `Application rate moved from ${first}% to ${last}% over the last ${series.length} data points.`,
        evidence: { previous_rate: first, current_rate: last, percent_change: Math.round((comparison.percentDelta ?? 0) * 10) / 10 },
        evidenceMeta: { dataAsOf: ctx.now.toISOString(), isStale: false },
        confidence: 'HIGH_CONFIDENCE',
        hoursUntilDeadline: null,
        audiences: ['TPO', 'MANAGEMENT'],
      },
    ];
  },
};

export const readinessMilestoneReached: Detector = {
  signalType: 'READINESS_MILESTONE_REACHED',
  triggeredByEvents: ['READINESS_UPDATED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const movements = await ctx.dataSource.getReadinessMovements(ctx.institutionId, ctx.seasonId);
    const milestones = movements.filter((m) => m.milestoneReached);
    if (milestones.length === 0) return [];

    return [
      {
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'READINESS_MILESTONE_REACHED',
        category: 'READINESS',
        polarity: 'POSITIVE',
        entityType: 'SEASON',
        entityId: ctx.seasonId,
        title: `${milestones.length} students became placement-ready this week`,
        summary: "Their readiness score crossed the institution's placement-ready threshold.",
        evidence: { students_reached_milestone: milestones.length },
        evidenceMeta: { dataAsOf: ctx.now.toISOString(), isStale: false },
        confidence: 'HIGH_CONFIDENCE',
        hoursUntilDeadline: null,
        audiences: ['TPO', 'MANAGEMENT'],
      },
    ];
  },
};

export const trainingCompletionImproved: Detector = {
  signalType: 'TRAINING_COMPLETION_IMPROVED',
  triggeredByEvents: ['TRAINING_COMPLETED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const series = await ctx.dataSource.getTrainingCompletionTrend(ctx.institutionId, ctx.seasonId);
    if (series.length < 3) return [];
    if (detectTrend(series.map((s) => ({ date: s.date, value: s.rate }))) !== 'IMPROVEMENT') return [];

    const first = series[0].rate;
    const last = series[series.length - 1].rate;
    const comparison = compareToBaseline(last, first, { minimumPercentDelta: 5 });
    if (!comparison.isNotable) return [];

    return [
      {
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'TRAINING_COMPLETION_IMPROVED',
        category: 'TRAINING',
        polarity: 'POSITIVE',
        entityType: 'SEASON',
        entityId: ctx.seasonId,
        title: `Training completion improved to ${last}%`,
        summary: `Up from ${first}% over the last ${series.length} data points.`,
        evidence: { previous_rate: first, current_rate: last },
        evidenceMeta: { dataAsOf: ctx.now.toISOString(), isStale: false },
        confidence: 'HIGH_CONFIDENCE',
        hoursUntilDeadline: null,
        audiences: ['TPO', 'MANAGEMENT'],
      },
    ];
  },
};
