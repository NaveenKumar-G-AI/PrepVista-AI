import type { DimensionResult, Evidence, Severity, AlignmentStatus } from "../../types";
import { makeFinding, scoreFromAlignment, unknownResult } from "../scoring";

const BIGO_RANK: Record<string, number> = {
  "o(1)": 0,
  "o(log n)": 1,
  "o(n)": 2,
  "o(n log n)": 3,
  "o(n^2)": 4,
  "o(n^3)": 5,
  "o(2^n)": 6,
  "o(n!)": 7,
};

const SYNONYMS: Record<string, string> = {
  constant: "o(1)",
  linear: "o(n)",
  quadratic: "o(n^2)",
  cubic: "o(n^3)",
  logarithmic: "o(log n)",
  "o(nlogn)": "o(n log n)",
  "o(n log(n))": "o(n log n)",
  "o(n*log n)": "o(n log n)",
  "o(n2)": "o(n^2)",
};

function normalizeBigO(input?: string): string | null {
  if (!input) return null;
  let s = input.toLowerCase().replace(/\s+/g, " ").trim();
  s = s.replace(/o\(\s*/, "o(").replace(/\s*\)/, ")");
  return SYNONYMS[s] ?? s;
}

export function compareComplexity(params: {
  claimed?: { time?: string };
  trusted?: { time: string; evidence?: Evidence[] };
}): DimensionResult {
  const dim = "COMPLEXITY_ALIGNMENT" as const;
  const trustedNorm = normalizeBigO(params.trusted?.time);
  const claimedNorm = normalizeBigO(params.claimed?.time);

  if (!trustedNorm) return unknownResult(dim, "No trusted complexity evidence available for this submission.");
  if (!claimedNorm) return unknownResult(dim, "Student did not make a specific time-complexity claim.");

  const claimedRank = BIGO_RANK[claimedNorm];
  const trustedRank = BIGO_RANK[trustedNorm];
  if (claimedRank === undefined || trustedRank === undefined) {
    return {
      dimension: dim,
      alignment: "UNKNOWN",
      score: null,
      confidence: 0.2,
      evidenceStrength: "WEAK",
      findings: [
        makeFinding({
          dimension: dim,
          severity: "LOW",
          evidenceStrength: "WEAK",
          confidence: 0.2,
          summary: "Complexity notation couldn't be confidently parsed; skipping automated comparison rather than guessing.",
          studentClaim: params.claimed?.time,
        }),
      ],
    };
  }

  if (claimedRank === trustedRank) {
    return { dimension: dim, alignment: "MATCH", score: 100, confidence: 0.9, evidenceStrength: "DIRECT", findings: [] };
  }

  const gap = Math.abs(claimedRank - trustedRank);
  const understates = claimedRank < trustedRank; // claims a BETTER complexity than reality — the more concerning direction
  const alignment: AlignmentStatus = gap <= 1 ? "PARTIAL" : "MISMATCH";
  const severity: Severity = understates ? (gap >= 2 ? "CRITICAL" : "HIGH") : gap >= 2 ? "HIGH" : "MEDIUM";
  const confidence = 0.85;

  const finding = makeFinding({
    dimension: dim,
    severity,
    evidenceStrength: "DIRECT",
    confidence,
    summary: `You described the time complexity as ${params.claimed?.time}, but verified analysis found ${params.trusted?.time}.`,
    studentClaim: params.claimed?.time,
    evidence: params.trusted?.evidence ?? [],
  });

  return { dimension: dim, alignment, score: scoreFromAlignment(alignment, confidence), confidence, evidenceStrength: "DIRECT", findings: [finding] };
}
