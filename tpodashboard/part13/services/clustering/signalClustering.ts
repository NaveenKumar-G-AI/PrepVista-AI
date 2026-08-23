// services/clustering/signalClustering.ts
//
// Sections 54/55 — when several related signals fire for the same
// department in the same window, present ONE coherent issue instead of
// several separate alerts. This is correlation-based grouping, not causal
// inference — the headline stays cautious ("requires attention"), it
// never asserts a cause the data doesn't actually support.

import type { ProactiveSignal, Severity } from '../signals/types';
import { SEVERITY_RANK } from '../signals/types';

export interface SignalCluster {
  clusterId: string;
  institutionId: string;
  departmentTag: string;
  headline: string;
  childSignalIds: string[];
  categories: string[];
  combinedSeverity: Severity;
  evidenceSummary: string;
}

export interface ClusteringOptions {
  minimumRelatedSignals?: number; // default 3 — two signals isn't a pattern yet
  minimumDistinctCategories?: number; // default 2
  windowHours?: number; // default 72
}

/** Groups open, risk-polarity signals that share an institution and
 * department and fall within a recent detection window, when enough
 * distinct categories are involved to suggest one underlying pipeline
 * issue rather than a coincidence. */
export function clusterSignals(
  signals: ProactiveSignal[],
  now: Date = new Date(),
  options: ClusteringOptions = {},
): SignalCluster[] {
  const minimumRelatedSignals = options.minimumRelatedSignals ?? 3;
  const minimumDistinctCategories = options.minimumDistinctCategories ?? 2;
  const windowHours = options.windowHours ?? 72;

  const candidates = signals.filter((s) => {
    if (s.polarity !== 'RISK') return false;
    if (!s.departmentTag) return false;
    if (!['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(s.status)) return false;
    const hoursOld = (now.getTime() - new Date(s.detectedAt).getTime()) / (1000 * 60 * 60);
    return hoursOld <= windowHours;
  });

  const byDeptInstitution = new Map<string, ProactiveSignal[]>();
  for (const s of candidates) {
    const key = `${s.institutionId}::${s.departmentTag}`;
    byDeptInstitution.set(key, [...(byDeptInstitution.get(key) ?? []), s]);
  }

  const windowBucket = Math.floor(now.getTime() / (windowHours * 60 * 60 * 1000));
  const clusters: SignalCluster[] = [];

  for (const [key, group] of byDeptInstitution) {
    const distinctCategories = new Set(group.map((s) => s.category));
    if (group.length < minimumRelatedSignals || distinctCategories.size < minimumDistinctCategories) continue;

    const [institutionId, departmentTag] = key.split('::');
    const worst = group.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));

    clusters.push({
      clusterId: `cluster::${key}::${windowBucket}`,
      institutionId,
      departmentTag,
      headline: `${departmentTag} placement pipeline requires attention`,
      childSignalIds: group.map((s) => s.id),
      categories: [...distinctCategories],
      combinedSeverity: worst.severity,
      evidenceSummary: `${group.length} related signals across ${distinctCategories.size} areas: ${[...distinctCategories].join(', ')}.`,
    });
  }

  return clusters;
}
