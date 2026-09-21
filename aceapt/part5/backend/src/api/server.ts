import cors from "cors";
import express from "express";
import { config } from "../config";
import "../db/client"; // ensures schema is bootstrapped before anything else touches the DB
import { adminRouter } from "./routes/admin";
import { dashboardRouter } from "./routes/dashboard";
import { devAuthRouter } from "./routes/devAuth";
import { sessionsRouter } from "./routes/sessions";
import { defaultRateLimiter, errorHandler } from "./middleware";

export function createServer() {
  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  app.use(defaultRateLimiter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", devAuthRouter);
  app.use("/api", dashboardRouter);
  app.use("/api", sessionsRouter);
  app.use("/api", adminRouter);

  app.use(errorHandler);
  return app;
}
