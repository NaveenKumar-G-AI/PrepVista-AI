import express from "express";
import cors from "cors";
import { env } from "../config/env.js";
import { router } from "./routes.js";
import { devAuthFallback, errorHandler } from "./middleware.js";
import { cohortMembership, deps, gateway } from "./deps.js";
import { FORECAST_EVENTS } from "../events/eventBus.js";
import { runForecastPipeline } from "../services/forecastOrchestrator.js";
import { seedDemoFixtures } from "../integration/devFixtures.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(devAuthFallback);
  app.use("/api/v1", router);
  app.use(errorHandler);
  return app;
}

/**
 * Example of closing the loop (section 59): whatever in your real platform
 * emits "an assessment/session just completed" should call
 * deps.eventBus.emit(FORECAST_EVENTS.ASSESSMENT_COMPLETED, { studentId })
 * (or an equivalent webhook/queue message) — this listener recalculates the
 * forecast in response, exactly like scripts/demo.ts does manually.
 */
deps.eventBus.on(FORECAST_EVENTS.ASSESSMENT_COMPLETED, ({ studentId }: { studentId: string }) => {
  runForecastPipeline(studentId, deps).catch((err: unknown) => {
    console.error(`Forecast recalculation failed for ${studentId}:`, err);
  });
});

const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
  if (!env.isProduction) {
    // Dev convenience only — makes the curl example above work immediately.
    // Real deployments should have no fixture data and no reason to call this.
    seedDemoFixtures(gateway, cohortMembership);
  }
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`ACEAPT Forecast API listening on :${env.port}`);
    console.log(`Try: curl -H "x-dev-student-id: demo-student" http://localhost:${env.port}/api/v1/students/demo-student/forecast`);
  });
}
