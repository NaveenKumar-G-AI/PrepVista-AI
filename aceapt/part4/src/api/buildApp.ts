import Fastify, { type FastifyInstance } from "fastify";
import authPlugin from "../plugins/auth.js";
import pathRoutes from "./routes/path.routes.js";
import actionsRoutes from "./routes/actions.routes.js";
import devEvidenceRoutes from "./routes/devEvidence.routes.js";
import type { Store } from "../repositories/types.js";
import { ZodError } from "zod";

export interface BuildAppOptions {
  store: Store;
  demoMode: boolean;
  logger?: boolean;
}

export function buildApp(opts: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request", details: err.issues });
    }
    request.log.error(err);
    return reply.code(500).send({ error: "Internal error" });
  });

  app.register(authPlugin, { demoMode: opts.demoMode });
  app.register(pathRoutes, { store: opts.store });
  app.register(actionsRoutes, { store: opts.store });
  if (opts.demoMode) {
    app.register(devEvidenceRoutes, { store: opts.store });
  }

  app.get("/health", async () => ({ ok: true }));

  return app;
}
