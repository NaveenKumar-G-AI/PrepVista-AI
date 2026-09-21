import type { ComparatorContext, DimensionResult, Finding } from "../../types";
import { makeFinding, scoreFromAlignment, unknownResult } from "../scoring";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function compareEdgeCases(ctx: ComparatorContext): Promise<DimensionResult> {
  const dim = "EDGE_CASE_ALIGNMENT" as const;
  const predictions = ctx.studentModel.edgeCasePredictions;
  const outcomes = ctx.implementationModel.edgeCaseOutcomes;

  if (predictions.length === 0) return unknownResult(dim, "Student made no specific edge-case predictions.");
  if (outcomes.length === 0) return unknownResult(dim, "No execution evidence was available to verify edge-case behavior.");

  const findings: Finding[] = [];
  let matches = 0;
  let mismatches = 0;

  for (const pred of predictions) {
    const outcome = outcomes.find((o) => o.case === pred.case);
    if (!outcome) continue; // this specific case wasn't executed — not enough evidence to judge it

    const predNorm = normalize(pred.studentPrediction);
    const actualNorm = normalize(outcome.actualOutcome);
    const isMatch = predNorm === actualNorm || predNorm.includes(actualNorm) || actualNorm.includes(predNorm);

    if (isMatch) {
      matches++;
      continue;
    }
    mismatches++;
    findings.push(
      makeFinding({
        dimension: dim,
        severity: "HIGH",
        evidenceStrength: "DIRECT",
        confidence: 0.9,
        summary: `For the "${pred.case}" case, you predicted: "${pred.studentPrediction}". Execution shows: "${outcome.actualOutcome}". This is a BEHAVIOUR_MISMATCH.`,
        studentClaim: pred.studentPrediction,
        metadata: { case: pred.case },
      }),
    );
  }

  const considered = matches + mismatches;
  if (considered === 0) return unknownResult(dim, "None of the student's edge-case predictions could be matched to execution evidence.");

  if (mismatches > 0) {
    const confidence = 0.85;
    const alignment = mismatches >= matches ? "MISMATCH" : "PARTIAL";
    return { dimension: dim, alignment, score: scoreFromAlignment(alignment, confidence), confidence, evidenceStrength: "DIRECT", findings };
  }
  return { dimension: dim, alignment: "MATCH", score: 100, confidence: 0.9, evidenceStrength: "DIRECT", findings: [] };
}
