// jobs/scheduledJobs.ts
//
// Section 68 — periodic checks, real scheduled jobs, not "fake recurring
// work in the frontend." Wire these functions into your actual job
// runner (cron, BullMQ, Vercel Cron, Temporal — whatever you already use
// elsewhere in the codebase; nothing here is scheduler-specific).

import type { DetectorContext } from '../modules/proactive/detectorFramework';
import { DetectorRegistry, runScheduledDetectors } from '../modules/proactive/detectorFramework';
import { runEscalationSweep } from '../services/escalation/escalationEngine';
import { generateDailyBriefing, generateEndOfDayBriefing, generateWeeklyIntelligence } from '../services/briefings/briefingGenerator';
import type { NotificationIntent } from '../services/signals/types';
import type { SignalRepository } from '../services/signals/repository';

/** STUB — replace with a real call into Part 9. Part 13 never sends
 * anything itself (section 70); this function is the single seam where a
 * NotificationIntent leaves this module. */
export async function publishNotificationIntent(intent: NotificationIntent): Promise<void> {
  // e.g. await part9.notifications.enqueue(intent);
  // eslint-disable-next-line no-console
  console.log('[proactive] notification intent ready for Part 9:', intent.kind, intent.institutionId);
}

export async function runDetectionCycle(registry: DetectorRegistry, ctx: DetectorContext) {
  return runScheduledDetectors(registry, ctx);
}

export async function runEscalationSweepJob(repository: SignalRepository, now: Date = new Date()) {
  return runEscalationSweep(repository, now);
}

/** Section 14 — signals already carry their own evidence freshness, but a
 * sweep is still useful to proactively flag a signal whose data source
 * has gone quiet (a stuck pipeline, a failed job upstream) rather than
 * waiting for the next detection cycle to notice on its own. */
export async function runEvidenceFreshnessSweepJob(repository: SignalRepository, now: Date = new Date()) {
  const open = await repository.listByStatuses(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS']);
  let flagged = 0;

  for (const signal of open) {
    const ageMinutes = (now.getTime() - new Date(signal.evidenceMeta.dataAsOf).getTime()) / (1000 * 60);
    const isStale = ageMinutes > 120; // conservative default; tune per signal type via the registry if needed
    if (isStale !== signal.evidenceMeta.isStale) {
      await repository.update(signal.id, { evidenceMeta: { ...signal.evidenceMeta, isStale } });
      if (isStale) flagged++;
    }
  }

  return { scanned: open.length, flagged };
}

function formatDailyBriefingBody(briefing: ReturnType<typeof generateDailyBriefing>): string {
  const { counts, positiveCount, topPriorities } = briefing;
  const lines = [
    `${counts.CRITICAL} critical, ${counts.HIGH} high, ${counts.MEDIUM} medium. ${positiveCount} positive developments.`,
    ...topPriorities.map((p, i) => `${i + 1}. ${p.title}`),
  ];
  return lines.join('\n');
}

export async function runDailyBriefingJob(institutionId: string, repository: SignalRepository): Promise<NotificationIntent[]> {
  const signals = await repository.listByInstitution(institutionId);
  const briefing = generateDailyBriefing(institutionId, signals);

  const intent: NotificationIntent = {
    id: `notif_${Date.now()}`,
    institutionId,
    audience: 'TPO',
    recipientIds: [], // Part 9 resolves recipients from role + institution
    kind: 'DAILY_BRIEFING',
    title: 'Good morning',
    body: formatDailyBriefingBody(briefing),
    createdAt: new Date().toISOString(),
  };

  await publishNotificationIntent(intent);
  return [intent];
}

export async function runEndOfDayBriefingJob(institutionId: string, repository: SignalRepository, sinceMidnight: Date) {
  const signals = await repository.listByInstitution(institutionId);
  return generateEndOfDayBriefing(institutionId, signals, sinceMidnight);
}

export async function runWeeklyIntelligenceJob(institutionId: string, repository: SignalRepository, sevenDaysAgo: Date) {
  const signals = await repository.listByInstitution(institutionId);
  return generateWeeklyIntelligence(institutionId, signals, sevenDaysAgo);
}
