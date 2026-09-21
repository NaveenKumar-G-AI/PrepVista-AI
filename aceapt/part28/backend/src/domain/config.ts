export interface VerificationEngineConfig {
  statusThresholds: {
    strong: number;
    verified: number;
    conditional: number;
    emerging: number;
    // below `emerging` → NOT_VERIFIED
  };
  confidenceThresholds: {
    high: number; // min quality-weighted effective evidence count for HIGH
    medium: number;
  };
  consistencyVarianceCeiling: number; // stddev of recent performance that fully zeroes the consistency factor
  lateTestDegradationThreshold: number; // pct-point drop, first quarter → final quarter, that counts as degradation
  minEvidenceForAnyStatus: number;
  evidenceStalenessDays: number; // Section 37 — readiness aging
  agingRecheckDays: number;
}

/** Sane defaults for a placement-prep context. Every number here is a
 *  product/policy decision, not an engineering constant — change this object
 *  (or load a per-target override from `verification_requirements`) rather
 *  than editing the engine's control flow. */
export const DEFAULT_VERIFICATION_CONFIG: VerificationEngineConfig = {
  statusThresholds: {
    strong: 0.9,
    verified: 0.78,
    conditional: 0.6,
    emerging: 0.35,
  },
  confidenceThresholds: {
    high: 8,
    medium: 4,
  },
  consistencyVarianceCeiling: 0.12,
  lateTestDegradationThreshold: 0.15,
  minEvidenceForAnyStatus: 3,
  evidenceStalenessDays: 21,
  agingRecheckDays: 35,
};
