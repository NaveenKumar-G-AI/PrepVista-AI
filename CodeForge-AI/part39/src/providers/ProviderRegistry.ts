import { ProviderHealth } from '../types';
import { AnthropicProvider } from './AnthropicProvider';
import { MockProvider } from './MockProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ProviderAdapter } from './ProviderAdapter';

/**
 * Central lookup for provider adapters. Application code asks the registry
 * for a provider by name; it never constructs an adapter directly. Adding
 * a new provider means writing one adapter and registering it here — no
 * other file needs to change.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  constructor(adapters: ProviderAdapter[] = [new MockProvider(), new AnthropicProvider(), new OpenAIProvider()]) {
    for (const adapter of adapters) this.providers.set(adapter.name, adapter);
  }

  get(name: string): ProviderAdapter {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown AI provider: ${name}`);
    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): ProviderAdapter[] {
    return [...this.providers.values()];
  }

  async healthAll(): Promise<ProviderHealth[]> {
    return Promise.all(this.list().map((p) => p.health()));
  }
}

export const providerRegistry = new ProviderRegistry();
