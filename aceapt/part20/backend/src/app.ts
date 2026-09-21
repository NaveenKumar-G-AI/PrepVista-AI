import "dotenv/config";
import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/api.js";

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
    })
  );
  app.use(express.json());
  app.use("/api", apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  return app;
}
