import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ServiceError, DuplicateCompanyError } from "../services/companyService.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof DuplicateCompanyError) {
    return res.status(409).json({
      error: err.message,
      duplicates: err.duplicates.map((d) => ({
        matchType: d.matchType,
        similarity: d.similarity,
        company: { id: d.company.id, name: d.company.name, website: d.company.website },
      })),
    });
  }
  if (err instanceof ServiceError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request.", details: err.flatten() });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error." });
}

/** Wraps an async route handler so thrown/rejected errors reach errorHandler. */
export function asyncRoute(fn: (req: Request, res: Response) => unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}
