import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { requireAuth } from "./api/middleware/auth.js";
import { interventionsRouter } from "./api/routes/interventions.js";
import { profilesRouter } from "./api/routes/profiles.js";
import { readinessRouter } from "./api/routes/readiness.js";
import { simulationsRouter } from "./api/routes/simulations.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "aceapt-feature13" }));

app.use("/api/assessment-profiles", requireAuth, profilesRouter);
app.use("/api/simulations", requireAuth, simulationsRouter);
app.use("/api/readiness", requireAuth, readinessRouter);
app.use("/api/interventions", requireAuth, interventionsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.issues });
    return;
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(err);
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT) || 4013;
app.listen(port, () => {
  console.log(`ACEAPT Feature 13 server listening on http://localhost:${port}`);
});
