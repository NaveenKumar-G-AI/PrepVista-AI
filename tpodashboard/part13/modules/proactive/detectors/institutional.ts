// modules/proactive/detectors/institutional.ts
//
// Recruiter-relationship, data-quality, and management-tier detectors.
// Recruiter signals are always TPO-side intelligence ABOUT a company —
// never anything delivered to the recruiter (sections 1/31).

import type { Detector, DetectorContext } from '../detectorFramework';
import type { SignalCandidate } from '../../../services/signals/types';
import { checkSampleSufficiency } from '../../../services/anomaly/anomalyEngine';

export const companyRelationshipStale: Detector = {
  signalType: 'COMPANY_RELATIONSHIP_STALE',
  triggeredByEvents: [],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const recruiters = await ctx.dataSource.getRecruiterActivity(ctx.institutionId);
    const out: SignalCandidate[] = [];

    for (const r of recruiters) {
      const daysSince = Math.round((ctx.now.getTime() - new Date(r.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince < 30 || r.historicalHires === 0) continue; // only companies with a real track record going quiet

      out.push({
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'COMPANY_RELATIONSHIP_STALE',
        category: 'COMPANY_RELATIONSHIP',
        polarity: 'RISK',
        entityType: 'COMPANY',
        entityId: r.companyId,
        title: `${r.companyName} has no recorded interaction for ${daysSince} days`,
        summary: `${r.companyName} hired ${r.historicalHires} students historically but has gone quiet.`,
        evidence: { days_since_last_interaction: daysSince, historical_hires: r.historicalHires },
        evidenceMeta: { dataAsOf: r.dataAsOf, isStale: false },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: 0,
        hoursUntilDeadline: null,
        recommendedAction: {
          type: 'REVIEW_RECRUITER_FOLLOWUP',
          label: 'Review recruiter follow-up',
          requiresConfirmation: true,
          targetQuery: { companyId: r.companyId },
        },
        audiences: ['TPO'],
      });
    }

    return out;
  },
};

export const dataQualityUnverifiedOutcome: Detector = {
  signalType: 'DATA_QUALITY_UNVERIFIED_OUTCOME',
  triggeredByEvents: ['DATA_QUALITY_ISSUE_CREATED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const rows = await ctx.dataSource.getUnverifiedPlacementOutcomes(ctx.institutionId);
    const oldEnough = rows.filter((r) => r.ageInDays >= 3); // normal verification lag gets some room
    if (oldEnough.length === 0) return [];

    return [
      {
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'DATA_QUALITY_UNVERIFIED_OUTCOME',
        category: 'DATA_QUALITY',
        polarity: 'RISK',
        entityType: 'SEASON',
        entityId: ctx.seasonId,
        title: `${oldEnough.length} placement outcomes remain unverified`,
        summary: `Oldest unverified outcome is ${Math.max(...oldEnough.map((r) => r.ageInDays))} days old. Unverified outcomes distort every placement-rate figure downstream.`,
        evidence: { unverified_count: oldEnough.length, oldest_days: Math.max(...oldEnough.map((r) => r.ageInDays)) },
        evidenceMeta: { dataAsOf: rows[0].dataAsOf, isStale: false },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: oldEnough.length,
        hoursUntilDeadline: null,
        recommendedAction: {
          type: 'REVIEW_UNVERIFIED_OUTCOMES',
          label: 'Review and verify outcomes',
          requiresConfirmation: true,
          targetQuery: { verified: false },
        },
        audiences: ['TPO'],
      },
    ];
  },
};

export const managementPlacementTargetGap: Detector = {
  signalType: 'MANAGEMENT_PLACEMENT_TARGET_GAP',
  triggeredByEvents: ['PLACEMENT_TARGET_UPDATED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const rows = await ctx.dataSource.getPlacementTargetStatus(ctx.institutionId, ctx.seasonId);
    const out: SignalCandidate[] = [];

    for (const row of rows) {
      const sample = checkSampleSufficiency(row.sampleSize, 15);
      if (!sample.sufficient) continue; // sections 32/52 — don't call a target "missed" off a handful of students

      const gap = row.target - row.actual;
      if (gap < 2) continue; // small deltas aren't a signal (section 4's "severity + evidence quality" bar)

      out.push({
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'MANAGEMENT_PLACEMENT_TARGET_GAP',
        category: 'MANAGEMENT',
        polarity: 'RISK',
        entityType: row.departmentTag ? 'DEPARTMENT' : 'INSTITUTION',
        entityId: row.departmentTag ?? ctx.institutionId,
        departmentTag: row.departmentTag,
        title: `Placement is ${gap.toFixed(1)} percentage points below target`,
        summary: `Target ${row.target}%, actual ${row.actual}%, based on ${row.sampleSize} students.`,
        evidence: { target: row.target, actual: row.actual, gap_points: Math.round(gap * 10) / 10, sample_size: row.sampleSize },
        evidenceMeta: { dataAsOf: row.dataAsOf, isStale: false },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: row.sampleSize,
        hoursUntilDeadline: null,
        institutionalSignificance: 0.8,
        recommendedAction: {
          type: 'REVIEW_PLACEMENT_TREND',
          label: 'Review placement trend and drivers',
          requiresConfirmation: false,
          targetQuery: { departmentTag: row.departmentTag },
        },
        audiences: ['TPO', 'MANAGEMENT'],
      });
    }

    return out;
  },
};
