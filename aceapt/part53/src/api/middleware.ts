import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import { Role } from '../types/enums.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      role: Role;
      tenantId?: string;
      actorId: string;
    }
  }
}

/**
 * THIS IS A DEMO STAND-IN, NOT REAL AUTH. It trusts `x-demo-role` / `x-demo-tenant` /
 * `x-demo-actor` headers as-is. Before this touches real traffic, replace the body of this
 * function with real session/JWT verification that derives role + tenant from a signed token —
 * see section 130 ("Enforce authentication, authorization, tenant isolation...").
 * `DEMO_ADMIN_TOKEN` in .env.example is where a real deployment would plug in that verification.
 */
export function demoAuth(req: Request, _res: Response, next: NextFunction): void {
  const roleHeader = (req.header('x-demo-role') ?? 'STUDENT').toUpperCase();
  req.role = (Object.values(Role) as string[]).includes(roleHeader) ? (roleHeader as Role) : Role.STUDENT;
  req.tenantId = req.header('x-demo-tenant') ?? undefined;
  req.actorId = req.header('x-demo-actor') ?? 'anonymous';
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({ error: err.code, message: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
}

export function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
