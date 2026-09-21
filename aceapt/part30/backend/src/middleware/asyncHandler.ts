import type { NextFunction, Request, Response } from "express";

/**
 * Express 4 does not catch a rejected promise returned from an async route
 * handler -- it becomes an unhandled rejection, which (on modern Node)
 * takes the whole process down rather than just failing the one request.
 * Every route in this reference build is async, so every route is wrapped
 * with this before being registered (see routes/path.ts). Express 5 fixes
 * this natively; if/when this codebase upgrades, this wrapper becomes a
 * no-op and can be removed.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Req, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
