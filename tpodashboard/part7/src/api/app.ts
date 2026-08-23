import express from "express";
import { attachActor } from "./middleware/auth";
import { errorHandler } from "./middleware/common";
import { tpoRouter } from "./tpo.routes";
import { studentRouter } from "./student.routes";
import { managementRouter } from "./management.routes";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/tpo", attachActor, tpoRouter);
  app.use("/api/student", attachActor, studentRouter);
  app.use("/api/management", attachActor, managementRouter);

  app.use(errorHandler);
  return app;
}
