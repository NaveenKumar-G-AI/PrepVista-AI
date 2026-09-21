import { env } from '../config/env';
import type { IntegrationPorts } from './ports';
import {
  MockSkillSignalAdapter,
  MockRoleReadinessAdapter,
  MockGrowthTrackingAdapter,
  MockNextBestActionAdapter,
} from './mockAdapters';

/**
 * Single place to wire real adapters in. When USE_MOCK_INTEGRATIONS is
 * false, replace the four `new Mock...Adapter()` calls below with real
 * implementations of the port interfaces in ports.ts (e.g. HTTP
 * clients, internal package calls, or gRPC stubs against your actual
 * Skill Signal Engine / Role Readiness Engine / Growth Tracking /
 * Next Best Action Engine).
 */
function buildIntegrations(): IntegrationPorts {
  if (!env.USE_MOCK_INTEGRATIONS) {
    throw new Error(
      'USE_MOCK_INTEGRATIONS=false but no real adapters are wired in ' +
        'src/integrations/index.ts yet. Implement the port interfaces in ' +
        'ports.ts against your existing services and construct them here.'
    );
  }

  return {
    skillSignals: new MockSkillSignalAdapter(),
    roleReadiness: new MockRoleReadinessAdapter(),
    growthTracking: new MockGrowthTrackingAdapter(),
    nextBestAction: new MockNextBestActionAdapter(),
  };
}

export const integrations: IntegrationPorts = buildIntegrations();
