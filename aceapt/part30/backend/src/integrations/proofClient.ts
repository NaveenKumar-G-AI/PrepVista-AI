export interface ProofResult {
  proofId: string;
  passed: boolean;
  score: number; // 0-100
  detail: string;
}

/**
 * Stand-in for ACEAPT's PROOF feature. Section 35: PATH connects to PROOF
 * for milestone verification and "does not recreate the proof engine".
 * The reference build's mock is deliberately conservative -- it only
 * passes a milestone when the underlying evidence requirement is
 * genuinely met, mirroring the real constraint that verification must be
 * evidence-backed, not just requested. Swap for a real call to
 * PROOF_SERVICE_URL.
 */
export async function requestProof(
  capabilityCode: string,
  currentValue: number,
  requiredValue: number
): Promise<ProofResult> {
  const passed = currentValue >= requiredValue;
  return {
    proofId: `proof_${capabilityCode}_${Date.now()}`,
    passed,
    score: Math.round(currentValue),
    detail: passed
      ? `Verified ${capabilityCode} at ${currentValue.toFixed(0)}, meeting the ${requiredValue.toFixed(0)} requirement.`
      : `${capabilityCode} is at ${currentValue.toFixed(0)}, below the ${requiredValue.toFixed(0)} requirement -- proof was not granted.`,
  };
}
