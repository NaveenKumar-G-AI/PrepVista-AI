import express from "express";
import { reportsErrorHandler, reportsRouter } from "./routes-reports";

export function buildApp() {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.use("/api", reportsRouter);
  app.use(reportsErrorHandler);

  return app;
}
