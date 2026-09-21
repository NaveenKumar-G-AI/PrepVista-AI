// ============================================================================
// Standalone dev server for this reference implementation
// (`npm run dev`). WHEN INTEGRATING into the main CodeForge AI codebase:
// mount buildInterviewRouter(container) onto your existing Express/Fastify
// app instead of running this file, and swap actorMiddleware() for your real
// auth middleware. Everything downstream of that (routes, orchestration,
// engine) is framework-agnostic and doesn't change.
// ============================================================================

import express from "express";
import { buildContainer } from "../orchestration/container.js";
import { buildInterviewRouter } from "./routes/interviews.js";
import { actorMiddleware } from "./middleware/actor.js";
import { errorHandler } from "./middleware/errorHandler.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3034;

export function createApp() {
  const container = buildContainer({ useLiveAIGateway: Boolean(process.env.ANTHROPIC_API_KEY) });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true, aiGateway: process.env.ANTHROPIC_API_KEY ? "live" : "deterministic-fixture" }));

  app.use(actorMiddleware());
  app.use("/api", buildInterviewRouter(container));
  app.use(errorHandler());

  return { app, container };
}

if (process.env.NODE_ENV !== "test") {
  const { app } = createApp();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`technical-interview-integration listening on :${PORT} (AI gateway: ${process.env.ANTHROPIC_API_KEY ? "live Anthropic" : "deterministic fixture — set ANTHROPIC_API_KEY to use live generation"})`);
  });
}
