import express, { type Express } from "express";
import cors from "cors";
import { buildReadinessRadarRouter } from "./routes/readinessRadar.js";
import { buildRateLimiter, errorHandler, notFoundHandler, requestLogger } from "./middleware/common.js";

export function buildApp(env: NodeJS.ProcessEnv = process.env): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: env.ALLOWED_ORIGIN || "http://localhost:5173" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/readiness-radar", buildRateLimiter(env), buildReadinessRadarRouter(env));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
