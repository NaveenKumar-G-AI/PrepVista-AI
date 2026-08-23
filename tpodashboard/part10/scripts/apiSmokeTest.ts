import express from "express";
import { openDatabase, runMigrations } from "../src/db.js";
import { buildContainer } from "../src/container.js";
import { buildRouter } from "../src/api/routes.js";

const PORT = 4010;
const db = openDatabase("data/prepvista_demo.db");
runMigrations(db);
const container = buildContainer(db);

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", buildRouter(container));

const server = app.listen(PORT, () => run());

async function get(path: string, role?: string) {
  const headers: Record<string, string> = {};
  if (role) headers["x-prepvista-role"] = role;
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

async function run() {
  console.log("=== 1) no role header -> expect 401 ===");
  console.log(await get("/api/institutions/inst_demo_college/departments?season=2026"));

  console.log("\n=== 2) recruiter role -> expect 403 (absolute product boundary) ===");
  console.log(await get("/api/institutions/inst_demo_college/departments?season=2026", "recruiter"));

  console.log("\n=== 3) management role, department report (2026) ===");
  const dept = await get("/api/institutions/inst_demo_college/departments?season=2026", "management");
  console.log("status:", dept.status);
  console.table(dept.body);

  console.log("\n=== 4) executive report draft, 2026 vs 2025 ===");
  const exec = await get(
    "/api/institutions/inst_demo_college/executive-report?season=2026&comparisonSeason=2025",
    "management"
  );
  console.log("status:", exec.status);
  console.log("kpis:", exec.body.kpis);
  console.log("insights:", exec.body.insights);
  console.log("top funnel comparison deltas:", exec.body.funnelComparison?.slice(0, 3));

  console.log("\n=== 5) warnings + data quality (2026) ===");
  const warn = await get("/api/institutions/inst_demo_college/warnings?season=2026", "tpo_head");
  console.log("status:", warn.status);
  console.log(JSON.stringify(warn.body, null, 2));

  console.log("\n=== 6) student role hitting the company/recruiter report -> expect 403 (visibility) ===");
  console.log(await get("/api/institutions/inst_demo_college/companies?season=2026", "student"));

  server.close(() => {
    db.close();
    process.exit(0);
  });
}
