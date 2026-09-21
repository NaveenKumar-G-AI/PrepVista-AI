import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import type { Role } from '../domain/enums';

/**
 * Section 5: students see their own individual intelligence (a
 * different, existing feature) — never unrestricted cohort
 * intelligence. Feature 36's endpoints are therefore never available
 * to the STUDENT role; every route explicitly lists its allowed roles.
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw new UnauthorizedError();
    if (!allowedRoles.includes(req.auth.role)) {
      throw new ForbiddenError(`Role '${req.auth.role}' is not permitted to perform this action.`);
    }
    next();
  };
}
