import type { Claim, ClaimVerification, Contradiction, ContradictionCategory, ClaimType } from "../types.js";

const CATEGORY_BY_CLAIM_TYPE: Partial<Record<ClaimType, ContradictionCategory>> = {
  ALGORITHM: "ALGORITHM_MISMATCH",
  DATA_STRUCTURE: "DATA_STRUCTURE_MISMATCH",
  CONTROL_FLOW: "CONTROL_FLOW_MISMATCH",
  COMPLEXITY: "COMPLEXITY_MISMATCH",
  SPACE_COMPLEXITY: "SPACE_COMPLEXITY_MISMATCH",
  EDGE_CASE: "EDGE_CASE_MISMATCH",
  CORRECTNESS: "CORRECTNESS_REASONING_MISMATCH",
  IMPLEMENTATION_DECISION: "IMPLEMENTATION_DECISION_MISMATCH",
  INVARIANT: "INVARIANT_MISMATCH",
  BEHAVIOR: "BEHAVIOR_MISMATCH",
  PROBLEM_UNDERSTANDING: "PROBLEM_UNDERSTANDING_MISMATCH",
  // OPTIMIZATION and TRADEOFF have no dedicated category in the taxonomy —
  // deliberately not force-mapped onto an unrelated one (see README).
};

function severityFor(claim: Claim, verification: ClaimVerification): "HIGH" | "MEDIUM" | "LOW" {
  if (verification.status === "CONTRADICTED") {
    if (claim.importance === "CORE") return "HIGH";
    if (claim.importance === "IMPORTANT") return "MEDIUM";
    return "LOW";
  }
  // PARTIALLY_SUPPORTED only becomes a contradiction record for CORE claims —
  // a near-miss on a supporting detail isn't worth flagging as a mismatch.
  return claim.importance === "CORE" ? "MEDIUM" : "LOW";
}

export function detectContradictions(claims: Claim[], verifications: ClaimVerification[]): Contradiction[] {
  const byId = new Map(claims.map((c) => [c.claimId, c]));
  const contradictions: Contradiction[] = [];

  for (const v of verifications) {
    const claim = byId.get(v.claimId);
    if (!claim) continue;
    const category = CATEGORY_BY_CLAIM_TYPE[claim.claimType];
    if (!category) continue;

    const isContradiction = v.status === "CONTRADICTED";
    const isCorePartial = v.status === "PARTIALLY_SUPPORTED" && claim.importance === "CORE";
    if (!isContradiction && !isCorePartial) continue;

    const evidenceDescription = v.evidence.map((e) => e.description).join(" ") || "No direct evidence was recorded.";
    contradictions.push({
      category,
      claimId: claim.claimId,
      severity: severityFor(claim, v),
      studentClaim: claim.originalText,
      actualEvidence: evidenceDescription,
      explanation: v.explanation,
      sourceLocation: v.evidence[0]?.sourceLocation ?? null,
    });
  }

  // Highest severity first so the report leads with what matters most.
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return contradictions.sort((a, b) => order[a.severity] - order[b.severity]);
}
