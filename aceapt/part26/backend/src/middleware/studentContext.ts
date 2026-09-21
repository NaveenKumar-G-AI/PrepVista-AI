import { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentId: string;
    }
  }
}

/**
 * Placeholder for real authentication (section 4/55). Reads a student id
 * from a header or query param so the API is easy to exercise without any
 * auth setup. Replace this with PrepVista's real session/auth middleware -
 * everything downstream just reads `req.studentId` and doesn't care where
 * it came from.
 */
export function studentContext(req: Request, _res: Response, next: NextFunction) {
  const fromHeader = req.header("x-student-id");
  const fromQuery = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
  req.studentId = fromHeader || fromQuery || "demo-student";
  next();
}
