import type { Claim, ClaimVerification, Contradiction, FollowUpQuestion, ReasoningScore, ReasoningReport } from "../types.js";

export interface BuildReportInput {
  submissionId: string;
  claims: Claim[];
  verifications: ClaimVerification[];
  contradictions: Contradiction[];
  followUpQuestions: FollowUpQuestion[];
  score: ReasoningScore;
  analysisVersion: string;
  reasoningVersion: number;
}

function humanizeClaimType(t: string): string {
  return t.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function buildReport(input: BuildReportInput): ReasoningReport {
  const claimById = new Map(input.claims.map((c) => [c.claimId, c]));

  const agreements = input.verifications
    .filter((v) => v.status === "SUPPORTED")
    .map((v) => {
      const claim = claimById.get(v.claimId);
      return claim ? `${humanizeClaimType(claim.claimType)} matches implementation — ${v.explanation}` : v.explanation;
    });

  const understanding = input.score.band.replace(" UNDERSTANDING", "") as ReasoningReport["understanding"];

  return {
    submissionId: input.submissionId,
    analysisVersion: input.analysisVersion,
    reasoningVersion: input.reasoningVersion,
    generatedAt: new Date().toISOString(),
    score: input.score,
    claims: input.claims,
    verifications: input.verifications,
    agreements,
    contradictions: input.contradictions,
    followUpQuestions: input.followUpQuestions,
    understanding,
  };
}
