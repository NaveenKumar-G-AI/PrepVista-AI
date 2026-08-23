import { runDataQualityChecks } from '../data-quality/dataQualityService';
import { listAudit } from '../audit/auditService';
import { getActivePolicy } from '../policy/policyService';
import { AuditQuery } from '../../db/repositories/auditRepo';

/** The four integration hooks spec section 79 asks Part 11 to expose for Part 10's reporting layer. */

export function getDataQuality(institutionId: string) {
  return runDataQualityChecks(institutionId);
}

export function getAuditEvidence(institutionId: string, filters: Omit<AuditQuery, 'institutionId'>) {
  return listAudit({ ...filters, institutionId });
}

export function getPolicyConfiguration(institutionId: string, key: string) {
  return getActivePolicy(institutionId, key);
}

export function getMetricConfiguration(_institutionId: string) {
  return { note: 'Metric definitions belong to Part 10 and are not implemented in this build.' };
}

/** Concrete answer to "is this institution's data trustworthy enough to publish a report?" (spec section 60). */
export function getReportReadiness(institutionId: string) {
  const dq = runDataQualityChecks(institutionId);
  return {
    ready: dq.counts.CRITICAL === 0,
    completenessScore: dq.completenessScore,
    blockingIssues: dq.issues.filter(i => i.severity === 'CRITICAL'),
  };
}
