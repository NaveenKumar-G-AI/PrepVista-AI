import "dotenv/config";
import { createApp } from "./app.js";
import { GapAnalysisService } from "../application/gapAnalysisService.js";
import { RecalculationService } from "../application/recalculationService.js";
import { PostgresGapRepositoryAdapter } from "../adapters/postgresGapRepository.js";
import { AIGatewayExplanationAdapter } from "../adapters/aiExplanation.js";
import {
  InMemoryCacheAdapter,
  InMemoryEventBusAdapter,
  InMemoryRoleModelAdapter,
  InMemorySkillStateAdapter,
  InMemoryEvidenceAdapter,
  NoopNextBestActionAdapter,
  NoopRoleReadinessAdapter,
  NoopTechnicalMasteryReportAdapter,
} from "../adapters/memory.js";

/**
 * Wiring root. This is the ONE place adapters get chosen. Swap the
 * InMemory* adapters below for real ones as you integrate each CodeForge
 * system - the application/domain layers never need to change.
 *
 *   - repository: already real (Postgres) once DATABASE_URL is set.
 *   - aiExplanation: already real (AI Gateway) once AI_GATEWAY_* is set;
 *     GapAnalysisService already treats its failure as non-fatal.
 *   - roleModel / skillState / evidence / cache / eventBus / downstream
 *     engines: still in-memory dev fixtures - see README "Wiring in your
 *     real systems" for what each needs to become.
 */
const repository = new PostgresGapRepositoryAdapter();
const aiExplanation = new AIGatewayExplanationAdapter();

const roleModel = new InMemoryRoleModelAdapter();
const skillState = new InMemorySkillStateAdapter();
const evidence = new InMemoryEvidenceAdapter();
const cache = new InMemoryCacheAdapter();
const eventBus = new InMemoryEventBusAdapter();

const gapAnalysis = new GapAnalysisService({
  roleModel,
  skillState,
  evidence,
  repository,
  cache,
  aiExplanation,
  nextBestAction: new NoopNextBestActionAdapter(),
  roleReadiness: new NoopRoleReadinessAdapter(),
  technicalMasteryReport: new NoopTechnicalMasteryReportAdapter(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const recalculation = new RecalculationService({ eventBus, roleModel, gapAnalysis });

const app = createApp({ gapAnalysis, repository });

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Role Skill Gap Analysis API listening on :${port}`);
});
