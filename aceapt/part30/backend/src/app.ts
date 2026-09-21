import "dotenv/config";
import express from "express";
import cors from "cors";
import type { ErrorRequestHandler } from "express";
import { devAuth } from "./middleware/auth.js";
import { pathRouter } from "./routes/path.js";
import { pool } from "./db/pool.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "db_unavailable" });
    }
  });

  app.use("/api/path", devAuth, pathRouter);

  // Section 54: never expose internal errors to students, never lose progress.
  // Every route handler is wrapped in asyncHandler (see routes/path.ts and
  // middleware/asyncHandler.ts), so a thrown error always reaches here
  // rather than crashing the process.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Path temporarily unavailable.", detail: "Your existing progress is safe." });
  };
  app.use(errorHandler);

  return app;
}
