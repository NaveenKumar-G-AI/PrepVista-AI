import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { newId, nowIso } from "../util/id.js";
import { SESSION_COOKIE, requireAuth } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";

const router = Router();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const isProd = process.env.NODE_ENV === "production";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncRoute(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = req.db.prepare(`select * from app_user where email = ?`).get(email) as
      | { id: string; institution_id: string; name: string; email: string; password_hash: string; role: string }
      | undefined;

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = newId();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    req.db
      .prepare(`insert into session (token, user_id, institution_id, created_at, expires_at) values (?, ?, ?, ?, ?)`)
      .run(token, user.id, user.institution_id, nowIso(), expiresAt);

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      expires: new Date(expiresAt),
    });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, institutionId: user.institution_id } });
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncRoute(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) req.db.prepare(`delete from session where token = ?`).run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json({ user: req.auth });
  })
);

export default router;
