// modules/proactive/detectors/pipeline.ts
//
// The core application -> interview -> offer -> joining pipeline. These
// are the detectors the spec's own worked examples are drawn from
// (sections 22-26, and the final demo walkthrough in section 87).

import type { Detector, DetectorContext } from '../detectorFramework';
import type { SignalCandidate } from '../../../services/signals/types';

function hoursUntil(iso: string, now: Date): number {
  return (new Date(iso).getTime() - now.getTime()) / (1000 * 60 * 60);
}
function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60);
}
function minutesSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60);
}

export const applicationEligibleNotApplied: Detector = {
  signalType: 'APPLICATION_ELIGIBLE_NOT_APPLIED',
  triggeredByEvents: ['APPLICATION_SUBMITTED', 'APPLICATION_DEADLINE_APPROACHING', 'DRIVE_DEADLINE_APPROACHING'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const snapshots = await ctx.dataSource.getDriveApplicationSnapshots(ctx.institutionId, 72);
    const out: SignalCandidate[] = [];

    for (const drive of snapshots) {
      const notApplied = drive.eligible - drive.applied;
      if (notApplied <= 0) continue;

      const hrs = hoursUntil(drive.deadlineAt, ctx.now);
      if (hrs < 0) continue; // deadline already passed — a different (closed-drive) signal, not this one

      const rate = drive.eligible > 0 ? (drive.applied / drive.eligible) * 100 : 0;

      out.push({
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'APPLICATION_ELIGIBLE_NOT_APPLIED',
        category: 'APPLICATION',
        polarity: 'RISK',
        entityType: 'DRIVE',
        entityId: drive.driveId,
        departmentTag: drive.departmentTag,
        title: `${notApplied} eligible students haven't applied to ${drive.driveName}`,
        summary: `Drive closes in ${Math.max(0, Math.round(hrs))} hours. ${drive.highReadinessNotApplied} of the ${notApplied} are already high-readiness.`,
        evidence: {
          eligible: drive.eligible,
          applied: drive.applied,
          not_applied: notApplied,
          application_rate: Math.round(rate * 10) / 10,
          hours_remaining: Math.round(hrs * 10) / 10,
          high_readiness_not_applied: drive.highReadinessNotApplied,
        },
        evidenceMeta: { dataAsOf: drive.dataAsOf, isStale: minutesSince(drive.dataAsOf, ctx.now) > 30 },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: notApplied,
        hoursUntilDeadline: hrs,
        recommendedAction: {
          type: 'REVIEW_STUDENT_LIST',
          label: `Review the ${drive.highReadinessNotApplied} high-readiness students first`,
          requiresConfirmation: true,
          targetQuery: { driveId: drive.driveId, applied: false, minReadinessPercentile: 75 },
          reason: 'High-readiness students are the highest-value outreach given limited time before the deadline.',
        },
        audiences: ['TPO'],
      });
    }

    return out;
  },
};

export const interviewResultPending: Detector = {
  signalType: 'INTERVIEW_RESULT_PENDING',
  triggeredByEvents: ['INTERVIEW_COMPLETED', 'RESULT_PUBLISHED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const pending = await ctx.dataSource.getPendingInterviewResults(ctx.institutionId);
    const out: SignalCandidate[] = [];

    // Group by drive so "12 results pending" reads as one signal per
    // drive, not twelve — matches section 24's own worked example, and
    // the dedup principle in section 15.
    const byDrive = new Map<string, typeof pending>();
    for (const p of pending) byDrive.set(p.driveId, [...(byDrive.get(p.driveId) ?? []), p]);

    for (const [driveId, rows] of byDrive) {
      const oldestHours = Math.max(...rows.map((r) => hoursSince(r.completedAt, ctx.now)));
      if (oldestHours < 12) continue; // section 24: 3 minutes -> no alert; only fire once meaningfully overdue

      const totalPending = rows.reduce((sum, r) => sum + r.candidateCount, 0);

      out.push({
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'INTERVIEW_RESULT_PENDING',
        category: 'INTERVIEW',
        polarity: 'RISK',
        entityType: 'DRIVE',
        entityId: driveId,
        departmentTag: rows[0].departmentTag,
        title: `${totalPending} interview results are still pending`,
        summary: `Oldest completed interview has been awaiting a result for ${Math.round(oldestHours)} hours.`,
        evidence: { pending_results: totalPending, interviews_pending: rows.length, oldest_pending_hours: Math.round(oldestHours) },
        evidenceMeta: { dataAsOf: rows[0].dataAsOf, isStale: minutesSince(rows[0].dataAsOf, ctx.now) > 30 },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: totalPending,
        hoursUntilDeadline: null,
        recommendedAction: {
          type: 'REVIEW_PENDING_RESULTS',
          label: 'Review pending interview results',
          requiresConfirmation: true,
          targetQuery: { driveId, resultStatus: 'PENDING' },
        },
        audiences: ['TPO'],
      });
    }

    return out;
  },
};

export const offerDeadlineApproaching: Detector = {
  signalType: 'OFFER_DEADLINE_APPROACHING',
  triggeredByEvents: ['OFFER_PUBLISHED', 'OFFER_DEADLINE_APPROACHING'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const offers = await ctx.dataSource.getExpiringOffers(ctx.institutionId, 48);
    if (offers.length === 0) return [];

    // One signal per urgency cohort, not one per offer (section 26 + the
    // dedup principle in section 15).
    const byWindow = new Map<string, typeof offers>();
    for (const o of offers) {
      const hrs = hoursUntil(o.expiresAt, ctx.now);
      const label = hrs <= 24 ? 'within 24 hours' : hrs <= 48 ? 'within 48 hours' : 'soon';
      byWindow.set(label, [...(byWindow.get(label) ?? []), o]);
    }

    const out: SignalCandidate[] = [];
    for (const [windowLabel, rows] of byWindow) {
      out.push({
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'OFFER_DEADLINE_APPROACHING',
        category: 'OFFER',
        polarity: 'RISK',
        entityType: 'OFFER_COHORT',
        entityId: `${windowLabel}::${ctx.now.toISOString().slice(0, 10)}`,
        title: `${rows.length} offers expire ${windowLabel}`,
        summary: `${rows.length} students have not confirmed acceptance and their offer window closes ${windowLabel}.`,
        evidence: { offers_expiring: rows.length, window: windowLabel },
        evidenceMeta: { dataAsOf: rows[0].dataAsOf, isStale: minutesSince(rows[0].dataAsOf, ctx.now) > 30 },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: rows.length,
        hoursUntilDeadline: Math.min(...rows.map((r) => hoursUntil(r.expiresAt, ctx.now))),
        recommendedAction: {
          type: 'REVIEW_STUDENT_LIST',
          label: 'Review students with unconfirmed offers',
          requiresConfirmation: true,
          targetQuery: { offerIds: rows.map((r) => r.offerId) },
        },
        audiences: ['TPO'],
      });
    }

    return out;
  },
};

export const joiningConfirmationMissing: Detector = {
  signalType: 'JOINING_CONFIRMATION_MISSING',
  triggeredByEvents: ['OFFER_ACCEPTED', 'JOINING_DATE_APPROACHING', 'JOINING_CONFIRMATION_SUBMITTED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const pending = await ctx.dataSource.getAcceptedOffersWithoutJoiningConfirmation(ctx.institutionId);
    if (pending.length === 0) return [];

    return [
      {
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'JOINING_CONFIRMATION_MISSING',
        category: 'JOINING',
        polarity: 'RISK',
        entityType: 'SEASON',
        entityId: ctx.seasonId,
        title: `${pending.length} accepted offers have no joining confirmation`,
        summary: 'These students accepted an offer but have not confirmed they will join.',
        evidence: { accepted_offers_pending_confirmation: pending.length },
        evidenceMeta: { dataAsOf: pending[0].dataAsOf, isStale: minutesSince(pending[0].dataAsOf, ctx.now) > 30 },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: pending.length,
        hoursUntilDeadline: Math.min(...pending.map((r) => hoursUntil(r.joiningDate, ctx.now))),
        recommendedAction: {
          type: 'REVIEW_STUDENT_LIST',
          label: 'Review students pending joining confirmation',
          requiresConfirmation: true,
          targetQuery: { offerIds: pending.map((r) => r.offerId) },
        },
        audiences: ['TPO'],
      },
    ];
  },
};
