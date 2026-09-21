import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InMemoryProblemBank } from '../../src/domain/problemBank/index.js';
import { FileGuidedSessionRepository } from '../../src/repositories/guidedSessionRepository.js';
import { FileGuidedStepStateRepository } from '../../src/repositories/guidedStepStateRepository.js';
import { FileGuidedAttemptRepository } from '../../src/repositories/guidedAttemptRepository.js';
import { FileGuidedAssistanceRepository } from '../../src/repositories/guidedAssistanceRepository.js';
import { FileGuidedOutcomeRepository } from '../../src/repositories/guidedOutcomeRepository.js';
import { ConsoleAnalyticsSink } from '../../src/domain/integrations/analytics.js';
import { LoggingMistakeIntelligencePort } from '../../src/domain/integrations/mistakeIntelligence.js';
import { LoggingMasteryPort } from '../../src/domain/integrations/mastery.js';
import { GuidedSolvingService } from '../../src/services/guidedSolvingService.js';

/**
 * Builds a fully-wired GuidedSolvingService against a fresh temp directory,
 * so tests exercise the REAL repository implementation (not a mock) while
 * staying isolated from each other and from the developer's own .data/.
 */
export function makeTestDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aceapt-guided-solving-test-'));
}

export function buildTestService(baseDir: string): GuidedSolvingService {
  return new GuidedSolvingService({
    problemBank: new InMemoryProblemBank(),
    sessions: new FileGuidedSessionRepository(baseDir),
    stepStates: new FileGuidedStepStateRepository(baseDir),
    attempts: new FileGuidedAttemptRepository(baseDir),
    assistance: new FileGuidedAssistanceRepository(baseDir),
    outcomes: new FileGuidedOutcomeRepository(baseDir),
    analytics: { track: () => {} },
    mistakeIntelligence: new LoggingMistakeIntelligencePort(),
    mastery: new LoggingMasteryPort(),
  });
}
