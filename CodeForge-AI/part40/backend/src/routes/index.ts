import { Router } from "express";
import securityRoutes from "./security.routes";
import auditRoutes from "./audit.routes";
import incidentsRoutes from "./incidents.routes";
import sessionsRoutes from "./sessions.routes";
import { healthRouter } from "./health.routes";

/**
 * Mounted at /api in app.ts, AFTER identityMiddleware — every route below
 * this point can assume req.identity is present (enforced defensively
 * again inside requirePermission()). Public, pre-auth routes
 * (publicHealthRouter) are mounted separately in app.ts, not here.
 */
export const apiRouter = Router();

apiRouter.use("/security", securityRoutes);
apiRouter.use("/audit", auditRoutes);
apiRouter.use("/incidents", incidentsRoutes);
apiRouter.use("/sessions", sessionsRoutes);
apiRouter.use("/health", healthRouter);
