import type { Blueprint, QuestionDifficulty } from "../../src/types/domain.js";

const DEFAULT_WEIGHT: Record<QuestionDifficulty, number> = { easy: 0.3, medium: 0.4, hard: 0.2, very_hard: 0.1 };

export const NODE = {
  quant: "domain-quant",
  arithmetic: "topic-arithmetic",
  percentage: "subtopic-percentage",
  percentageBasics: "skill-percentage-basics",
  percentageChange: "skill-percentage-change",
  ratio: "subtopic-ratio",
  ratioBasics: "skill-ratio-basics",
  logical: "domain-logical",
  patterns: "topic-patterns",
  numberSeries: "subtopic-number-series",
  numberSeriesBasics: "skill-number-series-basics",
} as const;

export function makeTestBlueprint(minEvidenceCount = 4): Blueprint {
  return {
    id: "bp-test-1",
    name: "Test Diagnostic Blueprint",
    mode: "first_diagnostic",
    nodes: [
      { id: NODE.quant, blueprintId: "bp-test-1", parentNodeId: null, level: "domain", code: "quant", label: "Quantitative Aptitude", minEvidenceCount: minEvidenceCount * 2, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.arithmetic, blueprintId: "bp-test-1", parentNodeId: NODE.quant, level: "topic", code: "quant.arithmetic", label: "Arithmetic", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.percentage, blueprintId: "bp-test-1", parentNodeId: NODE.arithmetic, level: "subtopic", code: "quant.arithmetic.percentage", label: "Percentage", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.percentageBasics, blueprintId: "bp-test-1", parentNodeId: NODE.percentage, level: "skill", code: "quant.arithmetic.percentage.basics", label: "Percentage Basics", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.percentageChange, blueprintId: "bp-test-1", parentNodeId: NODE.percentage, level: "skill", code: "quant.arithmetic.percentage.change", label: "Percentage Change", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.ratio, blueprintId: "bp-test-1", parentNodeId: NODE.arithmetic, level: "subtopic", code: "quant.arithmetic.ratio", label: "Ratio", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.ratioBasics, blueprintId: "bp-test-1", parentNodeId: NODE.ratio, level: "skill", code: "quant.arithmetic.ratio.basics", label: "Ratio Basics", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.logical, blueprintId: "bp-test-1", parentNodeId: null, level: "domain", code: "logical", label: "Logical Reasoning", minEvidenceCount: minEvidenceCount * 2, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.patterns, blueprintId: "bp-test-1", parentNodeId: NODE.logical, level: "topic", code: "logical.patterns", label: "Patterns", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.numberSeries, blueprintId: "bp-test-1", parentNodeId: NODE.patterns, level: "subtopic", code: "logical.patterns.numberseries", label: "Number Series", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
      { id: NODE.numberSeriesBasics, blueprintId: "bp-test-1", parentNodeId: NODE.numberSeries, level: "skill", code: "logical.patterns.numberseries.basics", label: "Number Series Basics", minEvidenceCount, targetDifficultyWeight: DEFAULT_WEIGHT },
    ],
  };
}
