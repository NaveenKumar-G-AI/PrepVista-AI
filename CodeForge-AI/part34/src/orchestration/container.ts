// ============================================================================
// Composition root. This is the ONE file that decides which concrete
// adapters back each port/repository. Swapping the in-memory adapters below
// for real Postgres repositories and real service clients means editing
// THIS FILE ONLY — every use case in orchestration/*.ts depends on the
// interfaces (RepositoryBundle, IntegrationPorts), never on these concrete
// classes directly.
// ============================================================================

import { createInMemoryRepositories } from "../db/inMemory/repositories.js";
import type { RepositoryBundle } from "../db/repositories.js";
import type { IntegrationPorts } from "../integration/ports.js";
import { FixtureRoleRequirementsAdapter, FixtureStudentEvidenceAdapter, InMemoryGrowthTrackingAdapter, InMemoryMasteryAdapter, InMemoryNextBestActionAdapter, InMemoryRoleReadinessAdapter, InMemoryRoleSkillGapAdapter, InMemorySkillSignalEngineAdapter } from "../integration/adapters/inMemoryEngines.js";
import { FixtureCodeAnalysisAdapter, FixtureDebuggingCoachAdapter, HeuristicReasoningVerificationAdapter, HeuristicUnderstandingCheckAdapter } from "../integration/adapters/heuristicAnalysis.js";
import { AnthropicAIGatewayAdapter, DeterministicFixtureAIGatewayAdapter } from "../integration/adapters/aiGateway.js";
import { DefaultAuthzAdapter, InMemoryObservabilityAdapter, UnconfiguredVoiceAdapter } from "../integration/adapters/systemAdapters.js";
import { EXAMPLE_GAPS, EXAMPLE_MASTERY, EXAMPLE_READINESS } from "../integration/adapters/fixtures.js";

export interface AppContainer {
  repositories: RepositoryBundle;
  ports: IntegrationPorts;
}

export interface ContainerOptions {
  /**
   * Use a live Anthropic-backed AI gateway instead of the deterministic
   * fixture one. Requires ANTHROPIC_API_KEY to be set — see
   * src/integration/adapters/aiGateway.ts. Defaults to false so tests and
   * local dev stay deterministic and free by default.
   */
  useLiveAIGateway?: boolean;
}

/**
 * Builds a fresh, isolated container — every call gets its own in-memory
 * stores, which is exactly what test isolation needs. A real deployment
 * would build ONE container at process startup (real DB pool, real service
 * clients) and reuse it across requests instead of calling this per-request.
 */
export function buildContainer(options: ContainerOptions = {}): AppContainer {
  const repositories = createInMemoryRepositories();

  const ports: IntegrationPorts = {
    roleRequirements: new FixtureRoleRequirementsAdapter(),
    studentEvidence: new FixtureStudentEvidenceAdapter(),
    skillSignalEngine: new InMemorySkillSignalEngineAdapter(),
    mastery: new InMemoryMasteryAdapter(EXAMPLE_MASTERY),
    growthTracking: new InMemoryGrowthTrackingAdapter(),
    roleSkillGap: new InMemoryRoleSkillGapAdapter(EXAMPLE_GAPS),
    roleReadiness: new InMemoryRoleReadinessAdapter(EXAMPLE_READINESS),
    nextBestAction: new InMemoryNextBestActionAdapter(),
    reasoningVerification: new HeuristicReasoningVerificationAdapter(),
    understandingCheck: new HeuristicUnderstandingCheckAdapter(),
    debuggingCoach: new FixtureDebuggingCoachAdapter(),
    codeAnalysis: new FixtureCodeAnalysisAdapter(),
    aiGateway: options.useLiveAIGateway ? new AnthropicAIGatewayAdapter() : new DeterministicFixtureAIGatewayAdapter(),
    voice: new UnconfiguredVoiceAdapter(),
    authz: new DefaultAuthzAdapter(),
    observability: new InMemoryObservabilityAdapter(),
  };

  return { repositories, ports };
}
