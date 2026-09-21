/**
 * Server bootstrap. This is the one file that should need edits when you
 * integrate real upstream adapters — swap any `null*Provider` import below
 * for your real implementation and nothing else in the module changes.
 */
import express from 'express';
import { config } from './config';
import { buildDecisionRouter } from './api/router';

import {
  PgCalibrationRepository,
  PgDecisionEventRepository,
  PgDecisionInsightRepository,
  PgDecisionPolicyRepository,
  PgScenarioRepository,
} from './repositories/pgRepositories';

import {
  consoleAnalyticsPublisher,
  nullAccuracyProvider,
  nullDifficultyProvider,
  nullEliminationVerifier,
  nullScoringPolicyProvider,
  templateAIGateway,
} from './adapters/defaultPorts';
import { anthropicAIGateway } from './adapters/aiGateway.anthropic';

import { AnswerSwitchService } from './services/answerSwitchService';
import { ConfidenceCalibrationService } from './services/confidenceCalibrationService';
import { DecisionInsightService } from './services/decisionInsightService';
import { DecisionPolicyService } from './services/decisionPolicyService';
import { DecisionTrainingService } from './services/decisionTrainingService';
import { GuessingIntelligenceService } from './services/guessingIntelligenceService';
import { OptionEliminationService } from './services/optionEliminationService';
import { StrategicSkippingService } from './services/strategicSkippingService';

function buildApp() {
  const app = express();
  app.use(express.json());

  // --- repositories -----------------------------------------------------
  const decisionEvents = new PgDecisionEventRepository();
  const decisionPolicies = new PgDecisionPolicyRepository();
  const decisionInsights = new PgDecisionInsightRepository();
  const calibrationSnapshots = new PgCalibrationRepository();
  const scenarios = new PgScenarioRepository();

  // --- ports: swap these for real adapters as you integrate --------------
  const aiGateway = config.aiGateway.apiKey ? anthropicAIGateway : templateAIGateway; // §192 AI fallback
  const analytics = consoleAnalyticsPublisher; // TODO: point at the real ACEAPT analytics pipeline
  const scoringPolicyProvider = nullScoringPolicyProvider; // TODO: Feature 58 §120 — real assessment scoring engine
  const accuracyProvider = nullAccuracyProvider; // TODO: Feature 51
  const difficultyProvider = nullDifficultyProvider; // TODO: Feature 55
  const eliminationVerifier = nullEliminationVerifier; // TODO: Feature 54/56/57-backed verifier

  // --- services -----------------------------------------------------------
  const decisionPolicyService = new DecisionPolicyService(decisionPolicies, scoringPolicyProvider);
  const optionEliminationService = new OptionEliminationService(eliminationVerifier); // wired in for future routes; see README
  void optionEliminationService;
  const decisionTrainingService = new DecisionTrainingService(scenarios, decisionEvents, difficultyProvider, analytics);
  const confidenceCalibrationService = new ConfidenceCalibrationService(decisionEvents, calibrationSnapshots, analytics);
  const strategicSkippingService = new StrategicSkippingService(accuracyProvider);
  const answerSwitchService = new AnswerSwitchService();
  const decisionInsightService = new DecisionInsightService(decisionEvents, decisionInsights, aiGateway, analytics);

  const guessingIntelligence = new GuessingIntelligenceService({
    events: decisionEvents,
    policies: decisionPolicyService,
    training: decisionTrainingService,
    calibration: confidenceCalibrationService,
    skipping: strategicSkippingService,
    switching: answerSwitchService,
    insights: decisionInsightService,
  });

  app.use('/api/decision', buildDecisionRouter({ guessingIntelligence, decisionPolicy: decisionPolicyService }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    res.status(400).json({ error: message });
  });

  return app;
}

if (require.main === module) {
  const app = buildApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Feature 58 — Guessing Intelligence Engine listening on port ${config.port}`);
  });
}

export { buildApp };
