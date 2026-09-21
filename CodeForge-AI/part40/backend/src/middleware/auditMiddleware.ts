import type { Request, Response, NextFunction } from "express";
import { recordAuditEvent } from "../audit/audit.service";

/**
 * CHANGE AUDITING (declarative)
 * -----------------------------------------------------------------------
 * For admin-shaped mutation routes: wraps the handler, captures a
 * before-state (via `loadBeforeState`, if provided) ahead of the call,
 * lets the handler set `res.locals.afterState` / `res.locals.resourceId`
 * on success, and always writes exactly one audit_event reflecting the
 * true outcome (SUCCESS/ERROR) — including on thrown errors, so a failed
 * "role change" attempt is itself part of the record, not just successful
 * ones. This is the fast path for routes that fit the common shape;
 * anything unusual can call audit.service.ts's recordAuditEvent()
 * directly instead.
 */

interface AuditOptions {
  action: string; // "resource.verb"
  eventType: string;
  resourceType: string;
  loadBeforeState?: (req: Request) => Promise<unknown>;
}

export function withAudit(opts: AuditOptions) {
  return (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      const identity = req.identity;
      const beforeState = opts.loadBeforeState ? await opts.loadBeforeState(req).catch(() => undefined) : undefined;

      try {
        await handler(req, res, next);

        // Only record success if the handler didn't already hand off to
        // errorHandler via next(err) — Express marks that by not reaching here normally,
        // but as a belt-and-suspenders check we also look at the final status code.
        if (res.statusCode < 400) {
          await recordAuditEvent({
            actorUserId: identity?.userId ?? null,
            actorRole: identity?.role ?? null,
            organizationId: identity?.organizationId ?? null,
            action: opts.action,
            eventType: opts.eventType,
            resourceType: opts.resourceType,
            resourceId: (res.locals.resourceId as string | undefined) ?? req.params.id,
            result: "SUCCESS",
            beforeState,
            afterState: res.locals.afterState,
            correlationId: req.correlationId,
            requestId: req.correlationId
          });
        } else {
          await recordAuditEvent({
            actorUserId: identity?.userId ?? null,
            actorRole: identity?.role ?? null,
            organizationId: identity?.organizationId ?? null,
            action: opts.action,
            eventType: opts.eventType,
            resourceType: opts.resourceType,
            resourceId: req.params.id,
            result: res.statusCode === 403 || res.statusCode === 401 ? "DENIED" : "ERROR",
            beforeState,
            correlationId: req.correlationId,
            requestId: req.correlationId
          });
        }
      } catch (err) {
        await recordAuditEvent({
          actorUserId: identity?.userId ?? null,
          actorRole: identity?.role ?? null,
          organizationId: identity?.organizationId ?? null,
          action: opts.action,
          eventType: opts.eventType,
          resourceType: opts.resourceType,
          resourceId: req.params.id,
          result: "ERROR",
          beforeState,
          metadata: { error: err instanceof Error ? err.message : String(err) },
          correlationId: req.correlationId,
          requestId: req.correlationId
        });
        next(err);
      }
    };
}
