import type { DimensionResult } from "../../types";
import { makeFinding, scoreFromAlignment, unknownResult } from "../scoring";

export function compareSpace(params: {
  claimedConstant: boolean;
  claimedSpace?: string;
  dataStructures: { name: string; type: string; growsWithInput: boolean }[];
}): DimensionResult {
  const dim = "SPACE_ALIGNMENT" as const;

  if (!params.claimedConstant && !params.claimedSpace) {
    return unknownResult(dim, "Student made no specific space-complexity claim.");
  }

  const growing = params.dataStructures.filter((d) => d.growsWithInput);

  if (params.claimedConstant && growing.length > 0) {
    const confidence = 0.85;
    const finding = makeFinding({
      dimension: dim,
      severity: "HIGH",
      evidenceStrength: "STRONG",
      confidence,
      summary: `You claimed constant extra space, but ${growing.map((d) => `\`${d.name}\``).join(", ")} grows with the input.`,
      studentClaim: params.claimedSpace ?? "O(1) / constant space",
    });
    return { dimension: dim, alignment: "MISMATCH", score: scoreFromAlignment("MISMATCH", confidence), confidence, evidenceStrength: "STRONG", findings: [finding] };
  }

  if (params.claimedConstant && growing.length === 0) {
    return { dimension: dim, alignment: "MATCH", score: 100, confidence: 0.8, evidenceStrength: "STRONG", findings: [] };
  }

  // A non-constant claim was made (e.g. "O(n) space") — this build doesn't yet
  // parse and verify non-constant space claims against actual growth rates,
  // so it reports partial credit at low confidence rather than a confident verdict.
  return { dimension: dim, alignment: "PARTIAL", score: scoreFromAlignment("PARTIAL", 0.4), confidence: 0.4, evidenceStrength: "WEAK", findings: [] };
}
