import { buildApp } from './api/app';
import {
  InMemoryFormulaRepository,
  InMemoryStudentStateRepository,
  InMemoryTrainingAttemptRepository,
  InMemoryTrainingSessionRepository,
} from './repositories';
import { seedFormulaRepository } from './seed/formulas.seed';

/**
 * Dev entry point using the in-memory repositories. Swap these for your
 * Postgres/Prisma-backed implementations before running against real
 * traffic - see docs/INTEGRATION.md. DATABASE_URL etc. are read from
 * environment variables that are left blank in .env.example on purpose.
 */
async function main(): Promise<void> {
  const formulaRepo = new InMemoryFormulaRepository();
  await seedFormulaRepository(formulaRepo);

  const app = buildApp({
    formulaRepo,
    stateRepo: new InMemoryStudentStateRepository(),
    attemptRepo: new InMemoryTrainingAttemptRepository(),
    sessionRepo: new InMemoryTrainingSessionRepository(),
  });

  const port = Number(process.env.PORT ?? 4056);
  app.listen(port, () => {
    console.log(`Formula Intelligence Engine listening on :${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
