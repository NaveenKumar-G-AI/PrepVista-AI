import Fastify from "fastify";
import { createAppPool } from "../../db/client.js";
import { PostgresDiagnosticRepository } from "../repositories/postgresDiagnosticRepository.js";
import { PostgresQuestionBank } from "../repositories/questionBank.js";
import { DiagnosticSessionService } from "../engine/sessionManager.js";
import { deterministicMistakeIntelligence } from "../engine/errorSignals.js";
import { createExplanationProvider } from "../ai/explanationProvider.js";
import { registerDiagnosticRoutes } from "./routes/diagnosticRoutes.js";

/**
 * This is a standalone-runnable example server for local development and
 * for the tests that exercise the API layer. Module 38: "Use the project's
 * existing route conventions" — when this is integrated into the real
 * ACEAPT backend, registerDiagnosticRoutes() is the piece that actually
 * matters; this file's job is just wiring, and would likely be replaced by
 * however ACEAPT already composes its Fastify (or other) app.
 */
export function buildServer() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  const appPool = createAppPool();
  const repo = new PostgresDiagnosticRepository(appPool);
  const questionBank = new PostgresQuestionBank(appPool);
  const explanationProvider = createExplanationProvider(process.env.GROQ_API_KEY, process.env.GROQ_MODEL);
  const service = new DiagnosticSessionService(repo, questionBank, deterministicMistakeIntelligence, explanationProvider);

  registerDiagnosticRoutes(app, service, repo);

  app.get("/health", async () => ({ status: "ok" }));

  app.addHook("onClose", async () => {
    await appPool.end();
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 4042);
  app
    .listen({ port, host: "0.0.0.0" })
    .then(() => app.log.info(`ACEAPT Feature 42 diagnostic engine listening on :${port}`))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
