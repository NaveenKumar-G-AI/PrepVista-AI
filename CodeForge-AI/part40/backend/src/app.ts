import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { baseLogger } from "./lib/logger";
import { corsOptions } from "./lib/cors";
import { correlationIdMiddleware } from "./lib/correlationId";
import { identityMiddleware } from "./middleware/identity";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimit, byUser } from "./middleware/rateLimit";
import { publicHealthRouter } from "./routes/health.routes";
import { apiRouter } from "./routes";

/**
 * PIPELINE (matches the brief):
 *
 *   Request
 *     -> Correlation ID              (lib/correlationId.ts)
 *     -> Security headers / CORS     (helmet, cors)
 *     -> Structured request logging  (pino-http, secret-redacted)
 *     -> [public] health probes      (routes/health.routes.ts publicHealthRouter — no auth)
 *     -> Authentication              (middleware/identity.ts)
 *     -> Default per-user rate limit (middleware/rateLimit.ts)
 *     -> Authorization + Tenant      (per-route: requirePermission / requireOrgParamMatch — routes/*.ts)
 *     -> Existing CodeForge feature  (the actual route handler)
 *     -> Audit / reliability telemetry (audit.service.ts / securityEvents.service.ts, called from handlers/middleware)
 *     -> Central error handler       (middleware/errorHandler.ts — always last)
 *
 * SECURITY HEADERS: helmet's defaults (HSTS, frame-deny, no-sniff,
 * referrer-policy) are sane for a JSON API. CSP is left off deliberately
 * — a CSP is only meaningful when it matches the frontend's actual
 * script/style origins, which this standalone module cannot know; the
 * host repo should configure `helmet.contentSecurityPolicy(...)` once
 * this is wired into the real frontend's asset origins.
 */

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(correlationIdMiddleware);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" })); // REQUEST SIZE: bounded body size, not unlimited

  app.use(
    pinoHttp({
      logger: baseLogger,
      genReqId: (req) => (req as express.Request).correlationId,
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info")
    })
  );

  // Public, pre-authentication — infra probes only. Deliberately mounted
  // before identityMiddleware; see routes/health.routes.ts for why.
  app.use("/health", publicHealthRouter);

  // Everything below this line requires a verified identity.
  app.use("/api", identityMiddleware);
  app.use(
    "/api",
    rateLimit({
      limit: env.RATE_LIMIT_DEFAULT_MAX_PER_MIN,
      windowMs: 60_000,
      keyFn: byUser,
      label: "api_default"
    })
  );
  app.use("/api", apiRouter);

  app.use((req, res) => {
    res.status(404).json({ error: "not_found", path: req.path });
  });

  app.use(errorHandler);

  return app;
}
