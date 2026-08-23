import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ValidationError } from "../../lib/errors";

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Express 5 types route params as `string | string[]` (to support
 *  wildcard routes). None of our routes use wildcards, so this just
 *  narrows back to `string` with a clear error if that assumption is ever
 *  violated, instead of `as string`-casting it away silently everywhere. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") throw new ValidationError(`Missing or invalid path parameter: ${name}`);
  return value;
}

export function queryParam(req: Request, name: string): string {
  const value = req.query[name];
  if (typeof value !== "string") throw new ValidationError(`Missing or invalid query parameter: ${name}`);
  return value;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err instanceof Error ? err.message : "Internal server error" });
}
