import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import type Database from "better-sqlite3";
import { attachDb } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errors.js";
import authRoutes from "./routes/auth.js";
import companyRoutes from "./routes/companies.js";
import contactRoutes from "./routes/contacts.js";
import followupRoutes from "./routes/followups.js";
import lookupRoutes from "./routes/lookups.js";
import commandCentreRoutes from "./routes/commandCentre.js";

export function createApp(db: Database.Database) {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachDb(db));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/companies", companyRoutes);
  app.use("/api/contacts", contactRoutes);
  app.use("/api/followups", followupRoutes);
  app.use("/api/lookups", lookupRoutes);
  app.use("/api/command-centre", commandCentreRoutes);

  app.use(errorHandler);

  return app;
}
