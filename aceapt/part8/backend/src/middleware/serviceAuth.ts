import type { Request, Response, NextFunction } from "express";

/**
 * Feature 5 (practice) and Feature 6 (assessment) call INTO Feature 8
 * server-to-server to report evidence - that's a different trust boundary
 * than a student's own browser session, so it gets its own shared-secret
 * check rather than reusing student JWTs. Swap this for whatever
 * service-to-service auth the real ACEAPT platform uses (mTLS, a signed
 * service JWT, etc) - a static key is the minimum viable version for a
 * standalone reference build.
 */
export function requireServiceKey(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.INTERNAL_INGEST_KEY;
  if (!configured) {
    res.status(503).json({ error: "INTERNAL_INGEST_KEY is not configured on this server - ingestion is disabled until it is." });
    return;
  }
  const provided = req.headers["x-aceapt-service-key"];
  if (provided !== configured) {
    res.status(401).json({ error: "Invalid or missing service key." });
    return;
  }
  next();
}
