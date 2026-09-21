import type { EvidenceAdapters, ExecutionEvidenceBundle, StaticAnalysisBundle, TrustedComplexityResult } from "../src/evidence/adapters";
import type { ProblemModel, RawReasoningClaim } from "../src/types";

const PROBLEM: ProblemModel = {
  id: "p1",
  title: "Remove Duplicates From Sorted Array",
  inputs: ["sorted array of integers"],
  outputs: ["length of the unique prefix; array modified in place"],
  constraints: ["array is sorted ascending"],
};

function claim(id: string, text: string, extra: Partial<RawReasoningClaim> = {}): RawReasoningClaim {
  return { id, text, ...extra };
}

function adaptersFrom(
  rawClaims: RawReasoningClaim[],
  staticAnalysis: StaticAnalysisBundle,
  execution: ExecutionEvidenceBundle | null,
  complexity: TrustedComplexityResult | null,
): EvidenceAdapters {
  return {
    getProblemContext: async () => PROBLEM,
    getRawReasoningClaims: async () => rawClaims,
    getStaticAnalysis: async () => staticAnalysis,
    getExecutionEvidence: async () => execution,
    getTrustedComplexity: async () => complexity,
  };
}

/** Fixture: "Fully consistent solution" — every dimension's reasoning matches the implementation. */
export function fullyConsistentFixture(): { adapters: EvidenceAdapters; submissionId: string; problemId: string } {
  const rawClaims: RawReasoningClaim[] = [
    claim("c1", "I maintain a sliding window using two pointers, left and right.", { dimensionHint: "ALGORITHM_ALIGNMENT" }),
    claim("c2", "left marks the position of the last unique element written so far.", {
      dimensionHint: "STATE_ALIGNMENT",
      structuredHint: { variable: "left" },
    }),
    claim("c3", "This algorithm is O(n) time.", { dimensionHint: "COMPLEXITY_ALIGNMENT", structuredHint: { complexityTime: "O(n)" } }),
    claim("c4", "It uses O(1) extra space since I only use a couple of index variables.", {
      dimensionHint: "SPACE_ALIGNMENT",
      structuredHint: { complexitySpace: "O(1)" },
    }),
    claim("c5", "An empty array returns 0.", { dimensionHint: "EDGE_CASE_ALIGNMENT", structuredHint: { edgeCase: "empty_array" } }),
    claim("c6", "The tests passing confirms the pointer logic correctly compacts unique values to the front.", {
      dimensionHint: "CORRECTNESS_ALIGNMENT",
    }),
  ];
  const staticAnalysis: StaticAnalysisBundle = {
    detectedPatternSignals: ["twoPointers", "windowBoundaryAdjustment"],
    dataStructures: [{ name: "nums", type: "array", growsWithInput: false }],
    variableFacts: [
      {
        variable: "left",
        facts: ["left is advanced only after writing a new unique value", "final value of left equals the count of unique elements"],
      },
    ],
  };
  const execution: ExecutionEvidenceBundle = {
    summary: { allVisibleTestsPassed: true, allHiddenTestsPassed: true },
    edgeCaseOutcomes: [{ case: "empty_array", actualOutcome: "returns 0" }],
  };
  const complexity: TrustedComplexityResult = { time: "O(n)", space: "O(1)" };

  return { adapters: adaptersFrom(rawClaims, staticAnalysis, execution, complexity), submissionId: "s-consistent", problemId: PROBLEM.id };
}

/** Fixture: "Algorithm mismatch" — student describes one algorithm while implementing another. */
export function algorithmMismatchFixture(): { adapters: EvidenceAdapters; submissionId: string; problemId: string } {
  const rawClaims: RawReasoningClaim[] = [
    claim("c1", "I use a hash set to track which elements I've already seen while scanning the array.", {
      dimensionHint: "ALGORITHM_ALIGNMENT",
    }),
    claim("c2", "This algorithm is O(n) time.", { dimensionHint: "COMPLEXITY_ALIGNMENT", structuredHint: { complexityTime: "O(n)" } }),
  ];
  const staticAnalysis: StaticAnalysisBundle = {
    detectedPatternSignals: ["twoPointers", "windowBoundaryAdjustment"], // no hash-set signal anywhere
    dataStructures: [{ name: "nums", type: "array", growsWithInput: false }],
    variableFacts: [],
  };
  const execution: ExecutionEvidenceBundle = {
    summary: { allVisibleTestsPassed: true, allHiddenTestsPassed: true },
    edgeCaseOutcomes: [],
  };
  const complexity: TrustedComplexityResult = { time: "O(n)" };

  return {
    adapters: adaptersFrom(rawClaims, staticAnalysis, execution, complexity),
    submissionId: "s-algo-mismatch",
    problemId: PROBLEM.id,
  };
}

/** Fixture: "Passing code / poor understanding" — tests pass but reasoning is substantially inconsistent. */
export function passingCodePoorUnderstandingFixture(): { adapters: EvidenceAdapters; submissionId: string; problemId: string } {
  const rawClaims: RawReasoningClaim[] = [
    claim("c1", "I recursively check each element to build up the answer.", { dimensionHint: "ALGORITHM_ALIGNMENT" }),
    claim("c2", "The tests passing shows this recursive approach is correct.", { dimensionHint: "CORRECTNESS_ALIGNMENT" }),
  ];
  const staticAnalysis: StaticAnalysisBundle = {
    detectedPatternSignals: ["twoPointers", "windowBoundaryAdjustment"], // iterative, not recursive
    dataStructures: [{ name: "nums", type: "array", growsWithInput: false }],
    variableFacts: [],
  };
  const execution: ExecutionEvidenceBundle = {
    summary: { allVisibleTestsPassed: true, allHiddenTestsPassed: true },
    edgeCaseOutcomes: [],
  };

  return {
    adapters: adaptersFrom(rawClaims, staticAnalysis, execution, null),
    submissionId: "s-passing-poor-understanding",
    problemId: PROBLEM.id,
  };
}
