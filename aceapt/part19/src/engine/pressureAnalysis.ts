// ============================================================================
// Retention under pressure.
//
// Untimed-strong / timed-weak is a distinct problem from "doesn't know
// it" — it's retrieval under pressure, which is Feature 13's territory.
// This module only detects and reports the evidence; Feature 13 decides
// what to do with it.
// ============================================================================

import { RetentionEvidence } from '../domain/types';
import { ReadinessPort } from '../integration/featurePorts';

const MIN_ATTEMPTS_PER_BUCKET = 2;
const CONCERNING_GAP = 0.25;

/** Returns true if pressure evidence was significant enough to report. */
export async function analyzeRetrievalUnderPressure(
  studentId: string,
  conceptId: string,
  evidence: RetentionEvidence,
  readiness: ReadinessPort
): Promise<boolean> {
  if (evidence.timedAttemptCount < MIN_ATTEMPTS_PER_BUCKET || evidence.untimedAttemptCount < MIN_ATTEMPTS_PER_BUCKET) {
    return false;
  }
  if (evidence.timedSuccessRate === null || evidence.untimedSuccessRate === null) return false;
  if (evidence.timedVsUntimedGap === null || evidence.timedVsUntimedGap < CONCERNING_GAP) return false;

  await readiness.reportPressureEvidence(studentId, conceptId, {
    untimedSuccessRate: evidence.untimedSuccessRate,
    timedSuccessRate: evidence.timedSuccessRate,
    gap: evidence.timedVsUntimedGap,
  });
  return true;
}
