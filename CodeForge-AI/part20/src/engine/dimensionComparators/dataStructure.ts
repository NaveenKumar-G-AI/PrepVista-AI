import type { ComparatorContext, DimensionResult } from "../../types";
import { makeFinding, scoreFromAlignment, unknownResult } from "../scoring";
import { checkSemanticEquivalence } from "../../ai/semanticEquivalence";

const STRUCTURE_KEYWORDS: Record<string, string[]> = {
  set: ["hash set", "hashset", " set "],
  map: ["hash map", "hashmap", "dictionary", " dict ", " map "],
  stack: ["stack"],
  queue: ["queue", "deque"],
  array: ["array", "list"],
  heap: ["heap", "priority queue"],
  linkedlist: ["linked list"],
};

function detectClaimedStructures(text: string): string[] {
  const t = ` ${text.toLowerCase()} `;
  return Object.entries(STRUCTURE_KEYWORDS)
    .filter(([, kws]) => kws.some((k) => t.includes(k)))
    .map(([name]) => name);
}

export async function compareDataStructure(ctx: ComparatorContext): Promise<DimensionResult> {
  const dim = "DATA_STRUCTURE_ALIGNMENT" as const;
  const claimText =
    ctx.studentModel.dataStructureClaims.map((c) => c.description).join(" ") ||
    ctx.studentModel.claimsByDimension.DATA_STRUCTURE_ALIGNMENT.map((c) => c.text).join(" ");

  if (!claimText.trim()) return unknownResult(dim, "Student made no specific claim about the data structures used.");
  if (ctx.implementationModel.dataStructures.length === 0) {
    return unknownResult(dim, "No structural evidence about data structures was available from static analysis.");
  }

  const claimed = detectClaimedStructures(claimText);
  const actualTypes = new Set(ctx.implementationModel.dataStructures.map((d) => d.type.toLowerCase()));

  if (claimed.length === 0) {
    const facts = ctx.implementationModel.dataStructures.map(
      (d) => `${d.name} is a ${d.type}${d.growsWithInput ? " that grows with input" : ""}`,
    );
    const eq = await checkSemanticEquivalence({ claimText, candidateFacts: facts, aiProvider: ctx.aiProvider });
    if (eq.verdict === "AI_UNAVAILABLE") return unknownResult(dim, "Could not determine data-structure alignment from the description alone.");
    const alignment = eq.verdict === "YES" ? "MATCH" : eq.verdict === "PARTIAL" ? "PARTIAL" : "MISMATCH";
    const confidence = eq.source === "ai" ? 0.7 : 0.45;
    const findings =
      alignment === "MATCH"
        ? []
        : [
            makeFinding({
              dimension: dim,
              severity: "MEDIUM",
              evidenceStrength: eq.source === "ai" ? "MODERATE" : "WEAK",
              confidence,
              summary: "The described data structure doesn't clearly match what the implementation actually uses.",
              studentClaim: claimText,
            }),
          ];
    return { dimension: dim, alignment, score: scoreFromAlignment(alignment, confidence), confidence, evidenceStrength: eq.source === "ai" ? "MODERATE" : "WEAK", findings };
  }

  const overlap = claimed.filter((c) => actualTypes.has(c));
  if (overlap.length > 0) {
    return { dimension: dim, alignment: "MATCH", score: 100, confidence: 0.8, evidenceStrength: "STRONG", findings: [] };
  }

  const confidence = 0.8;
  const finding = makeFinding({
    dimension: dim,
    severity: "HIGH",
    evidenceStrength: "STRONG",
    confidence,
    summary: `You described using a ${claimed.join("/")}, but the implementation's data structures are: ${[...actualTypes].join(", ")}.`,
    studentClaim: claimText,
  });
  return { dimension: dim, alignment: "MISMATCH", score: scoreFromAlignment("MISMATCH", confidence), confidence, evidenceStrength: "STRONG", findings: [finding] };
}
