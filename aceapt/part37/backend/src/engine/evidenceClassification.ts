import { EvidenceClass, EvidenceItem, EVIDENCE_CLASS_ORDER, evidenceClassRank } from '../types/domain';

/**
 * Base evidence class for each source type, BEFORE looking at how the
 * student actually performed. This encodes the product's central claim:
 * activity and self-report are not the same thing as demonstrated capability.
 */
const BASE_CLASS_BY_SOURCE: Record<EvidenceItem['sourceType'], EvidenceClass> = {
  SELF_REPORT: 'SELF_REPORTED',
  RESUME: 'SELF_REPORTED',
  TRAINING: 'ACTIVITY',
  CERTIFICATE: 'ACTIVITY',
  PORTFOLIO: 'ACTIVITY',
  ASSESSMENT: 'KNOWLEDGE',
  CODING_TEST: 'PRACTICE',
  MOCK_INTERVIEW: 'PRACTICE',
  SIMULATION: 'PRACTICE',
  PROJECT: 'DEMONSTRATED',
  INTERVIEW: 'VALIDATED',
  OPPORTUNITY_OUTCOME: 'REAL_WORLD',
};

function shift(cls: EvidenceClass, steps: number): EvidenceClass {
  const idx = Math.min(
    EVIDENCE_CLASS_ORDER.length - 1,
    Math.max(0, evidenceClassRank(cls) + steps)
  );
  return EVIDENCE_CLASS_ORDER[idx];
}

/**
 * Classifies one evidence item into its evidence class.
 *
 * Rules (deterministic, no AI involved):
 *  - Every source type has a base class (see table above).
 *  - A SIMULATION that was clearly passed / scored highly is treated as
 *    DEMONSTRATED, not just PRACTICE — a strong simulation result is a real
 *    demonstration of capability, not mere rehearsal.
 *  - A FAILED / WEAK outcome, or a low score, downgrades the class — a
 *    failed demonstration is not proof of the capability.
 *  - VALIDATED validation state can promote evidence, but never past
 *    VALIDATED itself, and it can never manufacture REAL_WORLD evidence
 *    (that class is reserved for actual opportunity outcomes).
 *  - DISPUTED validation state downgrades the class, since a disputed claim
 *    cannot be treated as clean proof.
 */
export function classifyEvidence(item: EvidenceItem): EvidenceClass {
  let cls = BASE_CLASS_BY_SOURCE[item.sourceType];

  if (item.sourceType === 'SIMULATION') {
    const strongOutcome = item.outcome === 'PASSED' || item.outcome === 'STRONG';
    const strongScore = item.score !== null && item.score >= 70;
    if (strongOutcome || strongScore) {
      cls = 'DEMONSTRATED';
    }
  }

  const failedOutcome = item.outcome === 'FAILED' || item.outcome === 'WEAK';
  const lowScore = item.score !== null && item.score < 40;
  if (failedOutcome || lowScore) {
    cls = shift(cls, -2);
  }

  if (item.validationState === 'VALIDATED' && evidenceClassRank(cls) < evidenceClassRank('VALIDATED')) {
    cls = 'VALIDATED';
  }
  if (item.validationState === 'DISPUTED') {
    cls = shift(cls, -2);
  }

  return cls;
}
