import {
  CONSISTENCY_DIMENSIONS,
  type ClaimNode,
  type ClaimRelationship,
  type ComparatorContext,
  type ConsistencyAnalysisResult,
  type ConsistencyDimension,
  type DimensionResult,
} from "../types";
import type { AIProvider } from "../ai/provider";
import type { EvidenceAdapters } from "../evidence/adapters";
import { buildStudentReasoningModel, buildImplementationModel } from "./modelBuilders";
import { buildClaimGraph, propagateContradictions } from "./claimGraph";
import { aggregateScore, bySeverityDesc } from "./scoring";
import { generateReconciliationQuestion } from "./reconciliation";
import { ENGINE_VERSION, RULES_VERSION } from "../config/scoring.config";

import { compareComplexity } from "./dimensionComparators/complexity";
import { compareSpace } from "./dimensionComparators/space";
import { compareAlgorithm } from "./dimensionComparators/algorithm";
import { compareDataStructure } from "./dimensionComparators/dataStructure";
import { compareVariableSemantics } from "./dimensionComparators/variableSemantics";
import { compareEdgeCases } from "./dimensionComparators/edgeCases";
import { compareCorrectness } from "./dimensionComparators/correctness";
import { compareGeneric } from "./dimensionComparators/genericComparator";

type ComparatorFn = (ctx: ComparatorContext) => Promise<DimensionResult>;

// CORRECTNESS_ALIGNMENT reads ALGORITHM_ALIGNMENT's result from
// ctx.resultsSoFar, so ALGORITHM_ALIGNMENT must run first. Order otherwise
// follows roughly the order dimensions are introduced in the spec.
const DIMENSION_ORDER: ConsistencyDimension[] = [
  "PROBLEM_ALIGNMENT",
  "ALGORITHM_ALIGNMENT",
  "DATA_STRUCTURE_ALIGNMENT",
  "STATE_ALIGNMENT",
  "CONTROL_FLOW_ALIGNMENT",
  "COMPLEXITY_ALIGNMENT",
  "SPACE_ALIGNMENT",
  "EDGE_CASE_ALIGNMENT",
  "BEHAVIOUR_ALIGNMENT",
  "IMPLEMENTATION_DECISION_ALIGNMENT",
  "OPTIMIZATION_ALIGNMENT",
  "CORRECTNESS_ALIGNMENT",
];

const COMPARATOR_REGISTRY: Record<ConsistencyDimension, ComparatorFn> = {
  PROBLEM_ALIGNMENT: (ctx) => compareGeneric("PROBLEM_ALIGNMENT", ctx),
  ALGORITHM_ALIGNMENT: compareAlgorithm,
  DATA_STRUCTURE_ALIGNMENT: compareDataStructure,
  STATE_ALIGNMENT: compareVariableSemantics,
  CONTROL_FLOW_ALIGNMENT: (ctx) => compareGeneric("CONTROL_FLOW_ALIGNMENT", ctx),
  CORRECTNESS_ALIGNMENT: compareCorrectness,
  COMPLEXITY_ALIGNMENT: async (ctx) =>
    compareComplexity({ claimed: ctx.studentModel.complexityClaim, trusted: ctx.implementationModel.trustedComplexity }),
  SPACE_ALIGNMENT: async (ctx) =>
    compareSpace({
      claimedConstant: /o\(1\)|constant/i.test(ctx.studentModel.complexityClaim?.space ?? ""),
      claimedSpace: ctx.studentModel.complexityClaim?.space,
      dataStructures: ctx.implementationModel.dataStructures,
    }),
  EDGE_CASE_ALIGNMENT: compareEdgeCases,
  BEHAVIOUR_ALIGNMENT: (ctx) => compareGeneric("BEHAVIOUR_ALIGNMENT", ctx),
  IMPLEMENTATION_DECISION_ALIGNMENT: (ctx) => compareGeneric("IMPLEMENTATION_DECISION_ALIGNMENT", ctx),
  OPTIMIZATION_ALIGNMENT: (ctx) => compareGeneric("OPTIMIZATION_ALIGNMENT", ctx),
};

export async function runConsistencyAnalysis(params: {
  submissionId: string;
  problemId: string;
  adapters: EvidenceAdapters;
  aiProvider: AIProvider;
}): Promise<ConsistencyAnalysisResult> {
  const [problem, rawClaims, staticAnalysis, execution, complexity] = await Promise.all([
    params.adapters.getProblemContext(params.problemId),
    params.adapters.getRawReasoningClaims(params.submissionId),
    params.adapters.getStaticAnalysis(params.submissionId),
    params.adapters.getExecutionEvidence(params.submissionId),
    params.adapters.getTrustedComplexity(params.submissionId),
  ]);

  const studentModel = await buildStudentReasoningModel(rawClaims, params.aiProvider);
  const implementationModel = buildImplementationModel({
    detectedPatternSignals: staticAnalysis.detectedPatternSignals,
    dataStructures: staticAnalysis.dataStructures,
    variableFacts: staticAnalysis.variableFacts,
    trustedComplexity: complexity ?? undefined,
    edgeCaseOutcomes: execution?.edgeCaseOutcomes,
    executionSummary: execution?.summary,
  });

  const claimNodes: ClaimNode[] = rawClaims.map((c) => ({ id: c.id, text: c.text, dimension: c.dimensionHint }));
  const relationships: ClaimRelationship[] = rawClaims.flatMap((c) =>
    (c.relatesTo ?? []).map(
      (toId): ClaimRelationship => ({ fromClaimId: c.id, toClaimId: toId, type: "SUPPORTS", confidence: 0.5 }),
    ),
  );
  const graph = buildClaimGraph(claimNodes, relationships);
  propagateContradictions(graph);

  const resultsSoFar: Partial<Record<ConsistencyDimension, DimensionResult>> = {};
  for (const dim of DIMENSION_ORDER) {
    const ctx: ComparatorContext = { studentModel, implementationModel, problem, aiProvider: params.aiProvider, resultsSoFar };
    resultsSoFar[dim] = await COMPARATOR_REGISTRY[dim](ctx);
  }
  const dimensionResults = CONSISTENCY_DIMENSIONS.map((d) => resultsSoFar[d]!);

  const findings = dimensionResults.flatMap((d) => d.findings).sort(bySeverityDesc);
  const { overallScore, overallState } = aggregateScore(dimensionResults);
  const recommendedReconciliationQuestion = generateReconciliationQuestion(findings);

  return {
    submissionId: params.submissionId,
    overallScore,
    overallState,
    dimensionResults,
    relationships: graph.relationships,
    findings,
    recommendedReconciliationQuestion,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
