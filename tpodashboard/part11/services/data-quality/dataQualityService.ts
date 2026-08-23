import { DATA_QUALITY_CHECKS, DataQualityIssue } from './checks';

export interface DataQualitySummary {
  issues: DataQualityIssue[];
  counts: Record<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', number>;
  completenessScore: number;
}

const SEVERITY_WEIGHT = { CRITICAL: 8, HIGH: 4, MEDIUM: 2, LOW: 1 };

export function runDataQualityChecks(institutionId: string): DataQualitySummary {
  const issues = DATA_QUALITY_CHECKS.flatMap(check => check(institutionId));

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const issue of issues) counts[issue.severity]++;

  const penalty = issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  const completenessScore = Math.max(0, Math.round(100 - penalty));

  return { issues, counts, completenessScore };
}
