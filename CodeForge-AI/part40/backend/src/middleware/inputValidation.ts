import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";
import { emitSecurityEvent } from "../security/securityEvents.service";

/**
 * INPUT VALIDATION
 * -----------------------------------------------------------------------
 * All externally-controlled input (body, query, path params) is validated
 * against an explicit zod schema before a handler runs — never relying on
 * frontend validation. Bodies are capped by express.json({ limit }) in
 * app.ts (REQUEST SIZE); this layer is about *shape correctness*, that
 * layer is about *size*.
 *
 * Repeated validation failures from the same actor/IP are themselves a
 * signal (enumeration/fuzzing) — INPUT_VALIDATION_FAILURE feeds
 * abuseDetection.ts like any other security event.
 */

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validateRequest(schemas: ValidationSchemas) {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const [part, schema] of Object.entries(schemas) as [keyof ValidationSchemas, ZodTypeAny | undefined][]) {
      if (!schema) continue;
      const result = schema.safeParse((req as unknown as Record<string, unknown>)[part]);
      if (!result.success) {
        await emitSecurityEvent({
          eventType: "INPUT_VALIDATION_FAILURE",
          actorUserId: req.identity?.userId ?? null,
          actorRole: req.identity?.role ?? null,
          organizationId: req.identity?.organizationId ?? null,
          resourceType: req.path,
          result: "DENIED",
          correlationId: req.correlationId,
          ipAddress: req.ip,
          metadata: { part, issueCount: result.error.issues.length }
        });
        return res.status(400).json({
          error: "invalid_request",
          part,
          issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        });
      }
      (req as unknown as Record<string, unknown>)[part] = result.data;
    }
    next();
  };
}
