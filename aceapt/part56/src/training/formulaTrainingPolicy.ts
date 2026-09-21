import { Difficulty, Novelty, SupportLevel, TrainingActivityType } from '../types';
import { FormulaStudentStateService } from '../state/formulaStudentStateService';
import { FormulaGraphService } from '../graph/formulaGraphService';
import { ConfusionDetector } from '../confusion/confusionDetector';
import { analyzeBottleneck } from '../bottleneck/formulaBottleneckAnalyzer';
import { DifficultyPort, NoveltyPort, PerformanceContextPort } from '../integrations/ports';

export interface NextActivityDecision {
  activityType: TrainingActivityType;
  formulaId: string;
  supportLevel: SupportLevel;
  difficulty: Difficulty;
  novelty: Novelty;
  discriminationCandidateFormulaIds?: string[];
  reason: string;
}

/**
 * Decides what to train next for a given student + formula (spec sections
 * 67, 122-123, 167-168, 181). Delegates the actual bottleneck detection to
 * formulaBottleneckAnalyzer and stays focused on turning that result into a
 * concrete activity directive - including picking a live confusion pair
 * when the bottleneck is selection (spec sections 128-129, 187).
 */
export class FormulaTrainingPolicy {
  constructor(
    private readonly stateService: FormulaStudentStateService,
    private readonly graphService: FormulaGraphService,
    private readonly confusionDetector: ConfusionDetector,
    private readonly difficultyProvider: DifficultyPort,
    private readonly noveltyProvider: NoveltyPort,
    private readonly performanceContext: PerformanceContextPort,
  ) {}

  async decideNext(studentId: string, formulaId: string, sessionId: string): Promise<NextActivityDecision> {
    const state = await this.stateService.getOrCreateState(studentId, formulaId);
    const bottleneck = analyzeBottleneck(state);
    const difficulty = await this.difficultyProvider.suggestDifficulty(studentId, formulaId);
    const timed = await this.performanceContext.isTimedModeActive(studentId, sessionId);
    const reasonSuffix = timed ? ' (timed mode is active - expect performance to dip under pressure before it stabilizes)' : '';

    if (!bottleneck) {
      const hasAnyEvidence = Object.values(state.dimensions).some((d) => d.attempts > 0);
      const activityType: TrainingActivityType = hasAnyEvidence ? 'APPLY' : 'RECOGNIZE';
      return {
        activityType,
        formulaId,
        supportLevel: state.supportLevel,
        difficulty,
        novelty: 'FAMILIAR',
        reason: hasAnyEvidence
          ? `Not enough evidence yet on any single dimension - building a broader base before targeting a bottleneck.${reasonSuffix}`
          : `First exposure to this formula family.${reasonSuffix}`,
      };
    }

    let discriminationCandidateFormulaIds: string[] | undefined;
    if (bottleneck.dimension === 'selection') {
      const confusable = await this.graphService.getConfusionPairs(formulaId);
      const activePattern: string[] = [];
      for (const candidate of confusable) {
        if (await this.confusionDetector.getConfusionPattern(studentId, formulaId, candidate)) {
          activePattern.push(candidate);
        }
      }
      discriminationCandidateFormulaIds = activePattern.length > 0 ? activePattern : confusable.length > 0 ? confusable : undefined;
    }

    const novelty: Novelty =
      bottleneck.dimension === 'transfer' ? 'NOVEL' : await this.noveltyProvider.suggestNovelty(studentId, formulaId);

    return {
      activityType: bottleneck.suggestedActivity,
      formulaId,
      supportLevel: state.supportLevel,
      difficulty,
      novelty,
      discriminationCandidateFormulaIds,
      reason: `${bottleneck.dimension} is the current bottleneck: ${(bottleneck.accuracy * 100).toFixed(0)}% over ${bottleneck.sampleSize} recent attempts (${bottleneck.trend.toLowerCase()}).${reasonSuffix}`,
    };
  }
}
