import { env } from './config/env.js';
import { createApp } from './app.js';
import { InMemoryContextSourceRepository, InMemoryStrategyStore } from './repositories/inMemoryRepository.js';
import { PgStrategyStore } from './repositories/pgRepository.js';
import { AnthropicLLMProvider } from './ai/anthropicProvider.js';
import { NullLLMProvider } from './ai/llmProvider.js';
import type { StrategyStore } from './repositories/types.js';

/**
 * Standalone runner — useful for local development and for the seed script,
 * NOT the intended production shape. In production this module should be
 * mounted into ACEAPT's existing API process (see app.ts docblock).
 */
async function main() {
  const sources = new InMemoryContextSourceRepository();

  let store: StrategyStore;
  if (env.useInMemoryStore) {
    store = new InMemoryStrategyStore();
  } else {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: env.databaseUrl });
    store = new PgStrategyStore(pool);
  }

  const llm = env.llmEnabled ? new AnthropicLLMProvider(env.anthropicApiKey, env.llmModel) : new NullLLMProvider();

  const app = createApp({ sources, store, llm });

  app.listen(env.port, () => {
    console.log(`Feature 41 (Career Strategy) listening on :${env.port}`);
    console.log(`  store: ${env.useInMemoryStore ? 'in-memory' : 'postgres'}`);
    console.log(`  llm:   ${llm.isAvailable ? `anthropic (${env.llmModel})` : 'disabled — deterministic fallback only'}`);
  });
}

main().catch((err) => {
  console.error('Failed to start Feature 41 module:', err);
  process.exit(1);
});
