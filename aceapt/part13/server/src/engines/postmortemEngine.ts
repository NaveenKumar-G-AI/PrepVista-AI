import type { SimulationRecord } from "../domain/types.js";
import {
  analyzeEndOfAssessmentDegradation,
  analyzeQuestionSelection,
  analyzeRecovery,
  analyzeTimeAllocation,
  analyzeTopicSwitching,
  classifySpeedAccuracy,
  overallAccuracy,
  type DegradationResult,
  type QuestionSelectionResult,
  type RecoveryResult,
  type SpeedAccuracyDistribution,
  type TimeAllocationInsight,
  type TopicSwitchingResult,
} from "./withinSimulationAnalysis.js";

export interface SimulationPostmortem {
  simulationId: string;
  score: number | null;
  maxScore: number | null;
  accuracyPct: number | null;
  answeredCount: number;
  unansweredCount: number;
  totalQuestions: number;
  speedAccuracy: SpeedAccuracyDistribution;
  timeAllocation: TimeAllocationInsight;
  questionSelection: QuestionSelectionResult;
  topicSwitching: TopicSwitchingResult;
  recovery: RecoveryResult;
  degradation: DegradationResult;
}

/**
 * Everything Feature 13 can say about ONE simulation from evidence alone —
 * no recommendation is generated here. "What should happen next" is Feature
 * 12's job (Section 26, 52); this engine only ever answers "what happened".
 */
export function buildSimulationPostmortem(sim: SimulationRecord): SimulationPostmortem {
  const attempts = sim.attempts;
  const accuracyPct = sim.accuracy !== null ? Math.round(sim.accuracy * 1000) / 10 : overallAccuracy(attempts);

  return {
    simulationId: sim.id,
    score: sim.totalScore,
    maxScore: sim.maxScore,
    accuracyPct,
    answeredCount: attempts.filter((a) => a.finalStatus === "answered").length,
    unansweredCount: attempts.filter((a) => a.finalStatus === "unanswered").length,
    totalQuestions: attempts.length,
    speedAccuracy: classifySpeedAccuracy(attempts),
    timeAllocation: analyzeTimeAllocation(attempts),
    questionSelection: analyzeQuestionSelection(attempts),
    topicSwitching: analyzeTopicSwitching(attempts),
    recovery: analyzeRecovery(attempts),
    degradation: analyzeEndOfAssessmentDegradation(attempts),
  };
}
