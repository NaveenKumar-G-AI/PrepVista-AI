import express from "express";
import { openDatabase, runMigrations } from "../db.js";
import { buildContainer } from "../container.js";
import { buildRouter } from "./routes.js";

const DB_PATH = process.env.PREPVISTA_DB_PATH ?? "data/prepvista_demo.db";
const PORT = Number(process.env.PORT ?? 4010);

const db = openDatabase(DB_PATH);
runMigrations(db);
const container = buildContainer(db);

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true, dbPath: DB_PATH }));
app.use("/api", buildRouter(container));

app.listen(PORT, () => {
  console.log(`PrepVista Part 10 reporting API listening on http://localhost:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});
