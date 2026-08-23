import type { Request, Response, NextFunction } from "express";
import type Database from "better-sqlite3";
import type { AuthContext } from "../types.js";

export const SESSION_COOKIE = "pv_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      db: Database.Database;
      auth?: AuthContext;
    }
  }
}

export function attachDb(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.db = db;
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "Not authenticated." });

  const session = req.db
    .prepare(
      `select s.*, u.name as user_name, u.role as role
       from session s join app_user u on u.id = s.user_id
       where s.token = ?`
    )
    .get(token) as
    | { token: string; user_id: string; institution_id: string; expires_at: string; user_name: string; role: string }
    | undefined;

  if (!session) return res.status(401).json({ error: "Session not found. Please log in again." });
  if (session.expires_at < new Date().toISOString()) {
    req.db.prepare(`delete from session where token = ?`).run(token);
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  req.auth = {
    userId: session.user_id,
    institutionId: session.institution_id,
    userName: session.user_name,
    role: session.role,
  };
  next();
}
