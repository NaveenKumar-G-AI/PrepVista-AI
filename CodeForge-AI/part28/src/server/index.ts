import express from "express";
import { serviceQuery, authenticatedQueryFor, closePools } from "./db.ts";
import { createPostgresGrowthRepository } from "../lib/growth/persistence/postgresRepository.ts";
import { createGrowthService } from "../lib/growth/service.ts";
import { createGrowthRouter } from "./routes/growth.ts";
import { devAuthMiddleware } from "./auth.ts";
import { normalizeEvidence } from "../lib/growth/evidence/normalize.ts";
import type { RoleGrowthProfile } from "../lib/growth/types.ts";

const app = express();
app.use(express.json());
app.use(devAuthMiddleware);

// The repository needs an `authenticatedQuery` bound to a specific user
// per call, but its interface takes no user parameter — so we build a
// fresh repository instance per request, scoped to that request's
// session. Writes still always go through the single shared service pool
// regardless of which repository instance issues them.
app.use((req, _res, next) => {
  const authenticatedQuery = authenticatedQueryFor(req.session?.userId ?? "anonymous");
  req.repo = createPostgresGrowthRepository({ serviceQuery, authenticatedQuery });
  req.growthService = createGrowthService(req.repo);
  next();
});

// Placeholder role-profile resolver — real CodeForge already has a role
// selection / role-skill-model system; this should call into it. Left as
// a pass-through that treats every dimension in the evidence as primary
// so the standalone build has something meaningful to return.
async function resolveRoleProfile(_studentId: string): Promise<RoleGrowthProfile | null> {
  return null;
}

app.use(
  "/api/growth",
  (req, res, next) => {
    const router = createGrowthRouter({ service: req.growthService!, repo: req.repo!, resolveRoleProfile });
    router(req, res, next);
  },
);

// ---------------------------------------------------------------------------
// INTERNAL ONLY — not part of the public API surface. This is where the
// real upstream systems (Correctness, Complexity, Debugging, ...) push
// evidence in, and where a background job would trigger recompute after.
// In production this should not be a public HTTP route at all — it exists
// here as a dev-only ingestion path (protected by the same header trick as
// devAuthMiddleware) so evidence -> engine -> API can be exercised
// end-to-end over real HTTP in this sandbox.
// ---------------------------------------------------------------------------
app.post("/internal/growth/ingest", async (req, res) => {
  if (req.header("x-internal-service-key") !== (process.env.INTERNAL_SERVICE_KEY ?? "dev-only-key")) {
    return res.status(401).json({ error: "not an authorized internal caller" });
  }
  try {
    const evidence = normalizeEvidence(req.body);
    await req.repo!.insertEvidence(evidence);
    res.status(201).json({ evidenceId: evidence.evidenceId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "invalid evidence payload" });
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

declare module "express-serve-static-core" {
  interface Request {
    repo?: import("../lib/growth/persistence/repository.ts").GrowthRepository;
    growthService?: import("../lib/growth/service.ts").GrowthService;
  }
}

const port = Number(process.env.PORT ?? 4300);
const server = app.listen(port, () => {
  console.log(`growth-tracking reference server listening on :${port}`);
});

process.on("SIGTERM", async () => {
  server.close();
  await closePools();
});

export { app };
