import { Router } from "express";
import { z } from "zod";
import { withServiceScope } from "../lib/db.js";
import { createStudent, findStudentByEmail, findStudentById } from "../repositories/studentRepository.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAuthToken } from "../lib/jwt.js";
import { genId } from "../lib/ids.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1).max(200),
});

/** Account creation/lookup runs on the service pool deliberately - there's
 *  no authenticated student session yet at this point (that's the whole
 *  problem register/login solve), so per-request RLS scoping doesn't apply
 *  here the way it does everywhere else. The password hash never leaves
 *  this file. */
authRouter.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await withServiceScope(async (client) => {
      const existing = await findStudentByEmail(client, input.email);
      if (existing) return null;
      const passwordHash = await hashPassword(input.password);
      return createStudent(client, { id: genId(), email: input.email, passwordHash, name: input.name });
    });

    if (!result) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }

    const token = signAuthToken({ studentId: result.id, email: result.email });
    res.status(201).json({ token, student: { id: result.id, email: result.email, name: result.name } });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const student = await withServiceScope((client) => findStudentByEmail(client, input.email));
    if (!student || !(await verifyPassword(input.password, student.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const token = signAuthToken({ studentId: student.id, email: student.email });
    res.status(200).json({ token, student: { id: student.id, email: student.email, name: student.name } });
  } catch (err) {
    next(err);
  }
});

/** Lets a client with a previously-issued token restore its session (e.g.
 *  after a page reload) without re-prompting for a password. */
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const student = await withServiceScope((client) => findStudentById(client, req.auth!.studentId));
    if (!student) {
      res.status(404).json({ error: "Student not found." });
      return;
    }
    res.json({ student: { id: student.id, email: student.email, name: student.name } });
  } catch (err) {
    next(err);
  }
});
