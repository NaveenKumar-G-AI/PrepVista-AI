import express, { Express } from 'express';
import { buildFormulaRouter } from './routes';
import { buildControllers } from './controllers';
import { FormulaRegistry } from '../registry/formulaRegistry';
import { FormulaGraphService } from '../graph/formulaGraphService';
import { FormulaStudentStateService } from '../state/formulaStudentStateService';
import { FormulaTrainingEngine } from '../training/formulaTrainingEngine';
import { FormulaTrainingPolicy } from '../training/formulaTrainingPolicy';
import { ConfusionDetector } from '../confusion/confusionDetector';
import {
  FormulaRepository,
  StudentStateRepository,
  TrainingAttemptRepository,
  TrainingSessionRepository,
} from '../repositories';
import { DefaultDifficultyAdapter, DefaultNoveltyAdapter, DefaultPerformanceContextAdapter } from '../integrations/ports';

export interface AppDependencies {
  formulaRepo: FormulaRepository;
  stateRepo: StudentStateRepository;
  attemptRepo: TrainingAttemptRepository;
  sessionRepo: TrainingSessionRepository;
}

export function buildApp(deps: AppDependencies): Express {
  const registry = new FormulaRegistry(deps.formulaRepo);
  const graphService = new FormulaGraphService(deps.formulaRepo);
  const stateService = new FormulaStudentStateService(deps.stateRepo);
  const confusionDetector = new ConfusionDetector(deps.attemptRepo);

  const policy = new FormulaTrainingPolicy(
    stateService,
    graphService,
    confusionDetector,
    new DefaultDifficultyAdapter(),
    new DefaultNoveltyAdapter(),
    new DefaultPerformanceContextAdapter(),
  );

  const trainingEngine = new FormulaTrainingEngine(
    registry,
    graphService,
    stateService,
    policy,
    deps.attemptRepo,
    deps.sessionRepo,
  );

  const controllers = buildControllers({ registry, graphService, stateService, trainingEngine, confusionDetector });

  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', buildFormulaRouter(controllers));
  return app;
}
