import express from "express";
import path from "node:path";
import { buildSocraticRouter } from "./api/routes";
import { env } from "./config/env";
import { SessionEngine } from "./domain/sessionEngine";
import { buildIntegrationBundle } from "./integrations";
import { FileSocraticRepository } from "./repositories/socraticRepository";

const repo = new FileSocraticRepository(env.dataDir);
const integrations = buildIntegrationBundle();
const engine = new SessionEngine(repo, integrations);

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(env.anthropicApiKey), authMode: env.authMode });
});

app.use("/api/socratic", buildSocraticRouter(engine));

app.use(express.static(path.join(__dirname, "..", "public")));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 46 (Socratic Teaching Mode) listening on http://localhost:${env.port}`);
  // eslint-disable-next-line no-console
  console.log(`AI rephrasing: ${env.anthropicApiKey ? "enabled" : "disabled (deterministic fallback only)"}`);
});

export { app, engine };
