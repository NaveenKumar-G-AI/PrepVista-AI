import { config, isDatabaseConfigured } from "./config.js";
import { buildApp } from "./api/app.js";
import { InMemoryDebuggingRepository } from "./repository/repository.js";
import { PgDebuggingRepository } from "./repository/pgRepository.js";
import { ProcessSandboxExecutor } from "./sandbox/executor.js";
import { AIProviderRouter } from "./ai/providers.js";

const repository = isDatabaseConfigured ? new PgDebuggingRepository(config.databaseUrl!) : new InMemoryDebuggingRepository();

if (!isDatabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn("[debugging-mode] DATABASE_URL not set - using the in-memory repository. Data will not persist across restarts.");
}

const aiRouter = new AIProviderRouter();
if (!aiRouter.isAnyConfigured) {
  // eslint-disable-next-line no-console
  console.warn("[debugging-mode] No AI provider key configured - DebuggingCoach will use deterministic, evidence-based hints only.");
}

const app = buildApp({ repository, executor: new ProcessSandboxExecutor(), aiRouter });

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[debugging-mode] listening on :${config.port}`);
});
