import { Feature3Client, MockFeature3Client } from './feature3';
import { Feature4Client, MockFeature4Client } from './feature4';
import { Feature5Client, MockFeature5Client } from './feature5';
import { Feature6Client, MockFeature6Client } from './feature6';
import { Feature7Client, MockFeature7Client } from './feature7';
import { Feature8Client, MockFeature8Client } from './feature8';

export * from './feature3';
export * from './feature4';
export * from './feature5';
export * from './feature6';
export * from './feature7';
export * from './feature8';

export interface Integrations {
  feature3: Feature3Client;
  feature4: Feature4Client;
  feature5: Feature5Client;
  feature6: Feature6Client;
  feature7: Feature7Client;
  feature8: Feature8Client;
}

/**
 * Default wiring uses the in-memory mocks so the engine runs
 * standalone. To connect the real ACEAPT platform, build a real
 * implementation of the relevant *Client interface and swap it in
 * here (or pass a custom Integrations object into createSimulationEngine
 * directly) - nothing else in src/services needs to change.
 */
export function createDefaultIntegrations(): Integrations {
  return {
    feature3: new MockFeature3Client(),
    feature4: new MockFeature4Client(),
    feature5: new MockFeature5Client(),
    feature6: new MockFeature6Client(),
    feature7: new MockFeature7Client(),
    feature8: new MockFeature8Client(),
  };
}
