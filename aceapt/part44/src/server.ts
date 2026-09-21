import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authenticate } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { buildGoalsRouter } from "./routes/goals.js";
import { GoalService } from "./services/goalService.js";
import { AiExtractionService } from "./services/aiExtractionService.js";
import { ExplanationService } from "./services/explanationService.js";
import { MockCapabilityDataClient } from "./integrations/capability/MockCapabilityDataClient.js";
import { ConsoleAnalyticsSink } from "./analytics/events.js";
import { getPool } from "./db/pool.js";

/**
 * Composition root. This is the ONE place that decides which concrete
 * implementation backs each interface - swapping the mock capability
 * client for the real Feature 43 client, or wiring a real analytics
 * sink, happens here and nowhere else (Section 72's architectural
 * boundary depends on every other file only knowing the interfaces).
 */
export function buildApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  const analytics = new ConsoleAnalyticsSink();
  const capabilityClient = new MockCapabilityDataClient(getPool());
  const goalService = new GoalService(capabilityClient, analytics);
  const aiExtraction = new AiExtractionService();
  const explanation = new ExplanationService();

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.use("/api", authenticate, buildGoalsRouter(goalService, aiExtraction, explanation, analytics));

  app.use(errorHandler);

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildApp();
  const port = Number(process.env.PORT) || 4044;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`ACEAPT Feature 44 (Goal-Based Learning Engine) listening on :${port}`);
  });
}
