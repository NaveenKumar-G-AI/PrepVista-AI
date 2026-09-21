// ============================================================================
// Converts the AI gateway's loosely-typed AIEvaluationRaw into the strict
// EvaluationDimensions/CorrectnessClass/ConsistencyClass enums, and enforces
// Phase 41 grounding: every entry in citedEvidence must be something that
// was actually offered to the model. An AI response that cites evidence it
// was never given is treated as a hallucination, not as usable output.
// ============================================================================

import { CORRECTNESS_CLASSES, CONSISTENCY_CLASSES, type CorrectnessClass, type ConsistencyClass, type EvaluationDimensions } from "../../domain/types.js";
import type { AIEvaluationRaw } from "../../integration/ports.js";

export interface MappedEvaluation {
  correctness: CorrectnessClass;
  dimensions: EvaluationDimensions;
  consistency?: ConsistencyClass;
  groundingViolation: boolean; // true if the model cited evidence it wasn't given
  ungroundedCitations: string[];
}

const REASONING_QUALITY_VALUES = ["STRONG", "ADEQUATE", "WEAK", "NOT_ASSESSED"] as const;
const UNDERSTANDING_VALUES = ["DEMONSTRATED", "PARTIAL", "NOT_DEMONSTRATED", "NOT_ASSESSED"] as const;
const DEPTH_VALUES = ["SURFACE", "MODERATE", "DEEP", "NOT_ASSESSED"] as const;
const APPLICATION_VALUES = ["APPLIED_CORRECTLY", "APPLIED_PARTIALLY", "NOT_APPLIED", "NOT_ASSESSED"] as const;
const CLARITY_VALUES = ["CLEAR", "ADEQUATE", "UNCLEAR", "NOT_ASSESSED"] as const;

function coerceEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value && (allowed as readonly string[]).includes(value)) return value as T;
  return fallback;
}

export function mapRawEvaluation(
  raw: AIEvaluationRaw,
  dimensionsRequested: string[],
  evidenceSummariesOffered: string[],
  codeExcerptWasOffered: boolean,
): MappedEvaluation {
  const correctness = coerceEnum<CorrectnessClass>(raw.correctness, CORRECTNESS_CLASSES, "INSUFFICIENT");

  const dimensions: EvaluationDimensions = { technicalCorrectness: correctness };
  if (dimensionsRequested.includes("reasoningQuality")) {
    dimensions.reasoningQuality = coerceEnum(raw.reasoningQuality, REASONING_QUALITY_VALUES, "NOT_ASSESSED");
  }
  if (dimensionsRequested.includes("understanding")) {
    dimensions.understanding = coerceEnum(raw.understanding, UNDERSTANDING_VALUES, "NOT_ASSESSED");
  }
  if (dimensionsRequested.includes("depth")) {
    dimensions.depth = coerceEnum(raw.depth, DEPTH_VALUES, "NOT_ASSESSED");
  }
  if (dimensionsRequested.includes("application")) {
    dimensions.application = coerceEnum(raw.application, APPLICATION_VALUES, "NOT_ASSESSED");
  }
  if (dimensionsRequested.includes("communicationClarity")) {
    dimensions.communicationClarity = coerceEnum(raw.communicationClarity, CLARITY_VALUES, "NOT_ASSESSED");
  }

  const consistency = raw.consistency ? coerceEnum<ConsistencyClass>(raw.consistency, CONSISTENCY_CLASSES, "UNCERTAIN") : undefined;

  const ungroundedCitations = raw.citedEvidence.filter((citation) => {
    if (evidenceSummariesOffered.includes(citation)) return false;
    if (codeExcerptWasOffered && /code|excerpt|function|snippet/i.test(citation)) return false; // loose match for code references
    return true;
  });

  return {
    correctness,
    dimensions,
    consistency,
    groundingViolation: ungroundedCitations.length > 0,
    ungroundedCitations,
  };
}
