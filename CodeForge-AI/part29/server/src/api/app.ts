import cors from "cors";
import express from "express";
import { router } from "./routes.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Dev-only convenience so the demo frontend has something to switch
  // between without a real login system. Never enable outside local
  // development — it returns user ids without any authentication.
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/dev/demo-users", async (_req, res) => {
      const { pool } = await import("../db/client.js");
      const users = await pool.query(
        `select id, email, name, role from users where email like '%@demo.codeforge.dev' order by role, email`
      );
      const cohort = await pool.query(`select id, name from cohorts limit 1`);
      res.json({ users: users.rows, cohort: cohort.rows[0] ?? null });
    });
  }

  app.use("/api", router);

  // Centralized error handler — keeps DB/validation errors from leaking
  // stack traces to the client while still logging them server-side.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[api error]", err);
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "INVALID_REQUEST", details: err.issues });
    }
    res.status(500).json({ error: "INTERNAL_ERROR" });
  });

  return app;
}
