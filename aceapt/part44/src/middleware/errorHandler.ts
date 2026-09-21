import type { NextFunction, Request, Response } from "express";
import { NotFoundError } from "../services/goalService.js";
import { ZodError } from "zod";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation_failed", details: err.issues });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_error" });
}

export function asyncRoute<T extends (req: Request, res: Response) => Promise<void>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
