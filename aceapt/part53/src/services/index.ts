import { QuestionRepository } from '../db/repository.js';
import { SemanticSimilarityPort } from '../validators/similarityValidator.js';
import { SkillGraphPort } from '../validators/skillAlignmentValidator.js';
import { LifecycleService } from './lifecycleService.js';
import { PublicationService } from './publicationService.js';
import { QuestionQualityService } from './questionQualityService.js';
import { ReportService } from './reportService.js';
import { ReviewService } from './reviewService.js';
import { AnalyticsService, AuditService } from './telemetry.js';
import { VersioningService } from './versioningService.js';

export interface EnginePorts {
  skillGraph?: SkillGraphPort;
  semanticSimilarity?: SemanticSimilarityPort;
  /** Defaults to true (AI step runs if ANTHROPIC_API_KEY/ANTHROPIC_MODEL are set, otherwise
   *  degrades gracefully). Set explicitly false to skip the AI step entirely regardless of env
   *  vars — useful for cost-sensitive batch jobs (section 135). */
  useAI?: boolean;
}

/**
 * Single composition root — everything the rest of the app (API routes, demo script, tests)
 * needs is reachable from the object this returns. Swap MemoryRepository for a real database
 * adapter and nothing else here has to change.
 */
export function createEngine(repo: QuestionRepository, ports: EnginePorts = {}) {
  const audit = new AuditService(repo);
  const analytics = new AnalyticsService();
  const lifecycle = new LifecycleService();
  const qualityService = new QuestionQualityService(repo, lifecycle, audit, analytics, ports);
  const versioningService = new VersioningService(repo, qualityService);
  const publicationService = new PublicationService(repo, lifecycle, audit, analytics);
  const reviewService = new ReviewService(repo, lifecycle, audit, analytics);
  const reportService = new ReportService(repo, lifecycle, publicationService, audit, analytics);

  return {
    repo,
    audit,
    analytics,
    lifecycle,
    qualityService,
    versioningService,
    publicationService,
    reviewService,
    reportService,
  };
}

export type Engine = ReturnType<typeof createEngine>;
