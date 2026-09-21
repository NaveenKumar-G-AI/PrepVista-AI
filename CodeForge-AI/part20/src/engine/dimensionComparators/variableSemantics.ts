import type { ComparatorContext, DimensionResult, Finding } from "../../types";
import { makeFinding, scoreFromAlignment, unknownResult } from "../scoring";
import { checkSemanticEquivalence } from "../../ai/semanticEquivalence";

/**
 * Produces the STATE_ALIGNMENT dimension result. Variable-role claims and
 * state-transition claims are treated together here since in practice
 * (and in the spec's own examples — `left` as "the first valid position")
 * they're the same underlying question: does the student's description of
 * what a variable represents match what the implementation actually
 * maintains?
 */
export async function compareVariableSemantics(ctx: ComparatorContext): Promise<DimensionResult> {
  const dim = "STATE_ALIGNMENT" as const;
  const claims = ctx.studentModel.variableClaims;
  if (claims.length === 0) return unknownResult(dim, "Student made no specific claims about variable roles or invariants.");
  if (ctx.implementationModel.variableFacts.length === 0) {
    return unknownResult(dim, "No derived variable-behavior facts were available from static/execution analysis.");
  }

  const findings: Finding[] = [];
  let matches = 0;
  let partials = 0;
  let mismatches = 0;

  for (const claim of claims) {
    const factEntry = ctx.implementationModel.variableFacts.find((f) => f.variable === claim.variable);
    if (!factEntry || factEntry.facts.length === 0) continue; // no evidence for this specific variable — skip rather than guess

    const eq = await checkSemanticEquivalence({ claimText: claim.claimedRole, candidateFacts: factEntry.facts, aiProvider: ctx.aiProvider });
    if (eq.verdict === "AI_UNAVAILABLE") continue;

    if (eq.verdict === "YES") {
      matches++;
      continue;
    }
    if (eq.verdict === "PARTIAL") partials++;
    else mismatches++;

    findings.push(
      makeFinding({
        dimension: dim,
        severity: eq.verdict === "PARTIAL" ? "MEDIUM" : "HIGH",
        evidenceStrength: eq.source === "ai" ? "MODERATE" : "WEAK",
        confidence: eq.source === "ai" ? 0.75 : 0.5,
        summary: `You described \`${claim.variable}\` as: "${claim.claimedRole}". The implementation's actual behavior for \`${claim.variable}\` doesn't fully match that description.`,
        studentClaim: claim.claimedRole,
        metadata: { variable: claim.variable },
      }),
    );
  }

  const considered = matches + partials + mismatches;
  if (considered === 0) return unknownResult(dim, "Variable claims could not be matched against any derived evidence.");

  if (mismatches > 0) {
    const confidence = 0.7;
    return { dimension: dim, alignment: "MISMATCH", score: scoreFromAlignment("MISMATCH", confidence), confidence, evidenceStrength: "MODERATE", findings };
  }
  if (partials > 0) {
    const confidence = 0.65;
    return { dimension: dim, alignment: "PARTIAL", score: scoreFromAlignment("PARTIAL", confidence), confidence, evidenceStrength: "MODERATE", findings };
  }
  return { dimension: dim, alignment: "MATCH", score: 100, confidence: 0.8, evidenceStrength: "STRONG", findings: [] };
}
