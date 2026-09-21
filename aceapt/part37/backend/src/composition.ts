import {
  LocalOpportunityProvider,
  LocalTrajectoryProvider,
  LoggingNextActionSink,
  NoopOutcomeAnalysisProvider,
  StaticValidationCatalogProvider,
} from './integrations/defaultAdapters';
import { ReadinessRepository } from './repositories/readinessRepository';
import { buildExplanationProvider } from './services/explanationProvider';
import { EvidenceIngestService } from './services/evidenceIngestService';
import { ReadinessService } from './services/readinessService';

/**
 * The one place in the codebase that decides which concrete adapter backs
 * each integration seam. Swapping a default (e.g. LocalTrajectoryProvider)
 * for a real Feature 34 client is a one-line change here — nothing in
 * services/, routes/, or engine/ needs to know or care.
 */
export function buildDependencies() {
  const repo = new ReadinessRepository();

  // Feature 33/34/35/36 aren't wired up (see README) — these are the
  // honest, non-fabricating local defaults from integrations/defaultAdapters.ts.
  const trajectoryProvider = new LocalTrajectoryProvider(repo);
  const opportunityProvider = new LocalOpportunityProvider(repo);
  const outcomeAnalysisProvider = new NoopOutcomeAnalysisProvider();
  const nextActionSink = new LoggingNextActionSink();
  const catalogProvider = new StaticValidationCatalogProvider();
  const explanationProvider = buildExplanationProvider(); // deterministic unless explicitly configured, see .env.example

  const readinessService = new ReadinessService(repo, trajectoryProvider, opportunityProvider, catalogProvider, explanationProvider);
  const evidenceIngestService = new EvidenceIngestService(repo, readinessService, trajectoryProvider, nextActionSink);

  return {
    repo,
    trajectoryProvider,
    opportunityProvider,
    outcomeAnalysisProvider,
    nextActionSink,
    catalogProvider,
    explanationProvider,
    readinessService,
    evidenceIngestService,
  };
}
