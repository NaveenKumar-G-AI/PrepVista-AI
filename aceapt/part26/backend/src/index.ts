import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { studentContext } from "./middleware/studentContext";
import { capabilityStateRouter } from "./routes/capabilityState";
import { nextActionRouter } from "./routes/nextAction";
import { adaptivePlanRouter } from "./routes/adaptivePlan";
import { actionRouter } from "./routes/action";
import { adaptationHistoryRouter } from "./routes/adaptationHistory";
import { resetDemoData } from "./engine/orchestrator";

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
app.use(studentContext);

app.get("/api/health", (_req, res) => res.json({ ok: true, feature: "ACEAPT ADAPT (Feature 26)" }));

app.use("/api/capability-state", capabilityStateRouter);
app.use("/api/next-action", nextActionRouter);
app.use("/api/adaptive-plan", adaptivePlanRouter);
app.use("/api/action", actionRouter);
app.use("/api/adaptation-history", adaptationHistoryRouter);

// Dev/demo convenience only - not part of Feature 26's real API surface.
app.post("/api/demo/reset", (_req, res) => {
  resetDemoData();
  res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`ACEAPT Adapt API listening on http://localhost:${env.port}`);
  console.log(`CORS allowed origin: ${env.corsOrigin}`);
});
