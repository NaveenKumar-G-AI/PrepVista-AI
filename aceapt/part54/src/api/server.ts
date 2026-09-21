import Fastify from "fastify";
import { createRegistry } from "../registry/bootstrap.js";
import { QuestionValidationService } from "../service/QuestionValidationService.js";
import { InMemoryValidationRunRepository, InMemoryValidationAuditRepository } from "../repositories/inmemory/InMemoryValidationRunRepository.js";
import { InMemoryValidationCache } from "../cache/ValidationCache.js";
import { registerValidationRoutes } from "./routes/validationRoutes.js";
import { DefaultScoringNormalizer } from "../ports/DefaultScoringNormalizer.js";
import { InMemorySkillGraphPort, InMemoryAssetStorePort } from "../ports/DefaultPorts.js";
import { GroqAdapter } from "../ai/GroqAdapter.js";

/**
 * Wires the whole engine together for local/dev use. Swap InMemory* for the
 * Postgres-backed implementations (src/repositories/postgres/) and the
 * DefaultPorts for real ACEAPT adapters when this integrates into the real
 * repo — see TRUTH_TABLE.md for exactly what's a port vs. what's real here.
 */
export function buildApp() {
  const registry = createRegistry(new GroqAdapter()); // real adapter, blank GROQ_API_KEY — see .env.example
  const runRepo = new InMemoryValidationRunRepository();
  const auditRepo = new InMemoryValidationAuditRepository();
  const cache = new InMemoryValidationCache();
  const service = new QuestionValidationService(registry, runRepo, auditRepo, cache);

  const ports = {
    skillGraph: new InMemorySkillGraphPort(),
    scoringNormalizer: new DefaultScoringNormalizer(),
    assetStore: new InMemoryAssetStorePort()
  };

  const app = Fastify({ logger: false });
  app.register(registerValidationRoutes(app, service, ports));
  app.get("/health", async () => ({ status: "ok", validators: registry.names().length }));

  return { app, service, registry, runRepo, auditRepo, cache, ports };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app } = buildApp();
  app.listen({ port: Number(process.env.PORT ?? 3054), host: "0.0.0.0" }).then((address) => {
    // eslint-disable-next-line no-console
    console.log(`ACEAPT Feature 54 — Question Validation Engine listening at ${address}`);
  });
}
