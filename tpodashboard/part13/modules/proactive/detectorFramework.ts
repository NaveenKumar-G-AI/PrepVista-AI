// modules/proactive/detectorFramework.ts
//
// Section 65's non-negotiable flow, as code:
//   Database/events -> Signal engine -> Verified signal -> AI explanation
// NOT: LLM imagination -> Alert.
//
// Detectors only ever return SignalCandidate[] computed from real data
// they pulled through DataSourcePort. Nothing in this file, or anything a
// detector calls, may invent a number — and detectors never touch the
// repository directly; commitCandidates() is the only write path.

import type { Audience, ProactiveSignal, SignalCandidate } from '../../services/signals/types';
import type { SignalRepository } from '../../services/signals/repository';
import { SIGNAL_REGISTRY } from '../../services/signals/registry';
import { upsertSignal } from '../../services/dedup/deduplicationEngine';
import { detectorSignalTypesForEvent } from './eventRouter';

// ---------------------------------------------------------------------------
// DataSourcePort — implement every method against your real Parts 1-12
// queries. Every detector shipped in this bundle only calls methods on
// this interface; swap the implementation and nothing else in Part 13
// changes. This is the one piece of the module that genuinely needs your
// real database — it can't be written from outside your repository.
// ---------------------------------------------------------------------------

export interface DriveApplicationSnapshot {
  driveId: string;
  driveName: string;
  departmentTag?: string;
  eligible: number;
  applied: number;
  deadlineAt: string;
  highReadinessNotApplied: number;
  dataAsOf: string;
}

export interface PendingInterviewResult {
  interviewId: string;
  driveId: string;
  departmentTag?: string;
  completedAt: string;
  candidateCount: number;
  dataAsOf: string;
}

export interface ExpiringOffer {
  offerId: string;
  studentId: string;
  driveId: string;
  departmentTag?: string;
  expiresAt: string;
  dataAsOf: string;
}

export interface AcceptedOfferPendingJoining {
  offerId: string;
  studentId: string;
  driveId: string;
  joiningDate: string;
  dataAsOf: string;
}

export interface TrainingAttendanceRow {
  trainingId: string;
  departmentTag?: string;
  requiredRate: number;
  belowThresholdCount: number;
  totalEnrolled: number;
  dataAsOf: string;
}

export interface ReadinessMovement {
  studentId: string;
  departmentTag?: string;
  previousScore: number;
  currentScore: number;
  measuredOverDays: number;
  milestoneReached?: boolean;
  dataAsOf: string;
}

export interface RecruiterActivity {
  companyId: string;
  companyName: string;
  lastInteractionAt: string;
  historicalHires: number;
  dataAsOf: string;
}

export interface UnverifiedOutcome {
  outcomeId: string;
  studentId: string;
  ageInDays: number;
  dataAsOf: string;
}

export interface PlacementTargetStatus {
  seasonId: string;
  departmentTag?: string;
  target: number;
  actual: number;
  sampleSize: number;
  dataAsOf: string;
}

export interface DataSourcePort {
  getDriveApplicationSnapshots(institutionId: string, withinHours: number): Promise<DriveApplicationSnapshot[]>;
  getPendingInterviewResults(institutionId: string): Promise<PendingInterviewResult[]>;
  getExpiringOffers(institutionId: string, withinHours: number): Promise<ExpiringOffer[]>;
  getAcceptedOffersWithoutJoiningConfirmation(institutionId: string): Promise<AcceptedOfferPendingJoining[]>;
  getTrainingAttendance(institutionId: string, seasonId: string): Promise<TrainingAttendanceRow[]>;
  getReadinessMovements(institutionId: string, seasonId: string): Promise<ReadinessMovement[]>;
  getRecruiterActivity(institutionId: string): Promise<RecruiterActivity[]>;
  getUnverifiedPlacementOutcomes(institutionId: string): Promise<UnverifiedOutcome[]>;
  getPlacementTargetStatus(institutionId: string, seasonId: string): Promise<PlacementTargetStatus[]>;
  getApplicationRateTrend(institutionId: string, seasonId: string): Promise<{ date: string; rate: number }[]>;
  getTrainingCompletionTrend(institutionId: string, seasonId: string): Promise<{ date: string; rate: number }[]>;
}

export interface DetectorContext {
  institutionId: string;
  seasonId: string;
  dataSource: DataSourcePort;
  repository: SignalRepository;
  now: Date;
}

export interface Detector {
  signalType: string;
  triggeredByEvents: string[];
  runScheduled?(ctx: DetectorContext): Promise<SignalCandidate[]>;
}

export class DetectorRegistry {
  private detectors: Detector[] = [];

  register(detector: Detector): void {
    this.detectors.push(detector);
  }

  getForEvent(eventType: string): Detector[] {
    const relevant = new Set(detectorSignalTypesForEvent(eventType));
    return this.detectors.filter((d) => relevant.has(d.signalType) || d.triggeredByEvents.includes(eventType));
  }

  all(): Detector[] {
    return this.detectors;
  }
}

/** Turns candidates into persisted, deduplicated, prioritized signals.
 * This is the ONLY function anything should call to write a signal —
 * detectors never touch the repository directly. */
export async function commitCandidates(
  repository: SignalRepository,
  candidates: SignalCandidate[],
  now: Date = new Date(),
): Promise<ProactiveSignal[]> {
  const results: ProactiveSignal[] = [];

  for (const candidate of candidates) {
    const definition = SIGNAL_REGISTRY[candidate.signalType];
    const severity = candidate.baseSeverity ?? definition?.defaultSeverity ?? 'MEDIUM';
    const actionability = definition?.defaultActionability ?? 'REVIEW';
    const audiences: Audience[] = candidate.audiences.length ? candidate.audiences : definition?.defaultAudiences ?? ['TPO'];

    const { signal } = await upsertSignal(
      repository,
      { ...candidate, audiences, baseSeverity: severity },
      { severity, actionability },
      () => now.toISOString(),
    );

    results.push(signal);
  }

  return results;
}

/** Section 68 — scheduled detectors run on a timer, not per-event. Call
 * this from your job scheduler (see jobs/scheduledJobs.ts). */
export async function runScheduledDetectors(registry: DetectorRegistry, ctx: DetectorContext): Promise<ProactiveSignal[]> {
  const all: SignalCandidate[] = [];
  for (const detector of registry.all()) {
    if (!detector.runScheduled) continue;
    all.push(...(await detector.runScheduled(ctx)));
  }
  return commitCandidates(ctx.repository, all, ctx.now);
}

/** Section 67 — event-driven path. Only detectors relevant to this event
 * type run, via DetectorRegistry.getForEvent(). Scheduled-only detectors
 * without a runScheduled equivalent for events are simply skipped here —
 * they run on their own timer instead. */
export async function processEvent(eventType: string, registry: DetectorRegistry, ctx: DetectorContext): Promise<ProactiveSignal[]> {
  const relevant = registry.getForEvent(eventType);
  const all: SignalCandidate[] = [];
  for (const detector of relevant) {
    if (!detector.runScheduled) continue;
    all.push(...(await detector.runScheduled(ctx)));
  }
  return commitCandidates(ctx.repository, all, ctx.now);
}
