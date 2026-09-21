import { Request, Response, NextFunction } from 'express';
import { withStudentContext } from '../db/pool';

/**
 * STAND-IN AUTH. No real ACEAPT auth/session system was available to
 * integrate with (see migration 001's header). This reads a student id from
 * an `X-Student-Id` header and verifies it against the students stand-in
 * table -- nothing more. It exists so every route below can be built,
 * seeded, and tested against something real.
 *
 * TO INTEGRATE: replace this file's body with the real session/JWT
 * middleware. The only contract the rest of Feature 40 depends on is that
 * `req.studentId` is set to a verified, authenticated student id before any
 * route handler runs -- keep that contract when swapping this out.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentId?: string;
    }
  }
}

export async function requireStudent(req: Request, res: Response, next: NextFunction) {
  const studentId = req.header('X-Student-Id');
  if (!studentId) {
    return res.status(401).json({ error: 'Missing X-Student-Id header (stand-in auth -- see src/middleware/auth.ts)' });
  }
  try {
    // The `students` table's own RLS policy is "id = current_student_id()",
    // so this SELECT can only succeed within a transaction that has already
    // set app.current_student_id to the id being asserted -- i.e. it verifies
    // exactly "this UUID exists as a real student row" (an earlier, more
    // convoluted version of this check was dead code for that same RLS
    // reason -- simplified to the one query that actually works).
    const exists = await withStudentContext(studentId, async (client) => {
      const { rows } = await client.query('SELECT id FROM students WHERE id = $1', [studentId]);
      return rows.length > 0;
    });
    if (!exists) return res.status(401).json({ error: 'Unknown student id' });
    req.studentId = studentId;
    next();
  } catch (err) {
    next(err);
  }
}
