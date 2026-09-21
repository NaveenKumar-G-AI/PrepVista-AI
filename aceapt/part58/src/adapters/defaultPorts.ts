/**
 * Default adapters — inert, dependency-free implementations of every port in
 * ports.ts. These exist so the module boots and behaves *safely* (never
 * fabricating data) even before it's wired into the real ACEAPT services.
 * Replace each with a real adapter as you integrate; nothing in services/*
 * needs to change when you do, since services only depend on the interfaces.
 */

import type {
  AccuracyProvider,
  AIGateway,
  AnalyticsPublisher,
  ConfidenceProvider,
  DifficultyProvider,
  ExplainDecisionInput,
  FormulaIntelligenceProvider,
  MistakeIntelligenceProvider,
  NoveltyProvider,
  PressureContextProvider,
  QuestionEliminationVerifier,
  QuestionQualityProvider,
  QuestionValidityProvider,
  ScenarioSpec,
  ScoringPolicyProvider,
  ShortcutStrategyProvider,
  SpeedProvider,
  SummarizeInput,
} from '../ports';

export const nullConfidenceProvider: ConfidenceProvider = {
  async getConfidence() {
    return null;
  },
};

export const nullNoveltyProvider: NoveltyProvider = {
  async getNovelty() {
    return null;
  },
};

export const nullSpeedProvider: SpeedProvider = {
  async getExpectedStudentTimeSeconds() {
    return null;
  },
};

export const nullAccuracyProvider: AccuracyProvider = {
  async getComparableAccuracy() {
    return null;
  },
};

export const nullPressureProvider: PressureContextProvider = {
  async getPressureContext() {
    return null;
  },
};

/** Fails closed: an unknown question is treated as NOT high-quality, so it
 *  can't silently become the basis for a strong decision-quality claim. */
export const nullQuestionQualityProvider: QuestionQualityProvider = {
  async isHighQuality() {
    return false;
  },
};

/** Fails closed for the same reason (§65-66). Wire in the real Feature 54
 *  provider before trusting decision analysis on live data. */
export const nullQuestionValidityProvider: QuestionValidityProvider = {
  async isValid() {
    return false;
  },
};

export const nullDifficultyProvider: DifficultyProvider = {
  async getCalibratedDifficulty() {
    return null;
  },
};

export const nullFormulaProvider: FormulaIntelligenceProvider = {
  async getFormulaContext() {
    return null;
  },
};

export const nullShortcutProvider: ShortcutStrategyProvider = {
  async getApplicableStrategies() {
    return [];
  },
};

export const nullMistakeIntelligenceProvider: MistakeIntelligenceProvider = {
  async getRecentMistakePatterns() {
    return [];
  },
};

/** No verifier wired in => every elimination is recorded as SELF_REPORTED,
 *  never silently upgraded to OBSERVED/VERIFIED (§102-103). */
export const nullEliminationVerifier: QuestionEliminationVerifier = {
  async verifyElimination() {
    return 'SELF_REPORTED';
  },
};

/** Scoring rules must come from a real source of truth — this adapter
 *  deliberately returns null rather than guessing, per §120-121. */
export const nullScoringPolicyProvider: ScoringPolicyProvider = {
  async getScoringPolicy() {
    return null;
  },
};

export const consoleAnalyticsPublisher: AnalyticsPublisher = {
  async publish(event, payload) {
    // Replace with the real analytics pipeline. Kept side-effect-light on
    // purpose — this should never be the system of record.
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, payload);
  },
};

/**
 * Template-based AI fallback (§192, "AI FALLBACK"). Produces plain,
 * evidence-based, non-shaming text without calling any model, so the whole
 * feature keeps working with AI_GATEWAY_API_KEY unset. See
 * adapters/aiGateway.anthropic.ts for a real model-backed implementation.
 */
export const templateAIGateway: AIGateway = {
  async explainDecision(input: ExplainDecisionInput) {
    const outcomeText =
      input.isCorrect === null ? 'not yet graded' : input.isCorrect ? 'correct' : 'incorrect';
    return (
      `Action taken: ${input.action}. Evidence available at the time: ${input.evidenceSummary || 'none recorded'}. ` +
      `Outcome: ${outcomeText}. This reflects the information you had when you decided — not what turned out to be true afterward.`
    );
  },
  async summarizePatterns(input: SummarizeInput) {
    return `Pattern detected: ${input.bottleneck}. Based on ${JSON.stringify(input.stats)}.`;
  },
  async draftTrainingScenario(_spec: ScenarioSpec) {
    throw new Error(
      'templateAIGateway cannot author new scenarios. Configure AI_GATEWAY_API_KEY and use ' +
        'AnthropicAIGateway, or serve scenarios from a curated bank via ScenarioRepository.'
    );
  },
};
