import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../../config";
import { Role } from "../../domain/enums";
import { StudentRepository } from "../../repositories/catalogRepository";
import { AuditService } from "../../services/auditService";
import { validateBody } from "../middleware";

export const devAuthRouter = Router();

const schema = z.object({
  studentId: z.string().min(1).max(64),
  role: z.nativeEnum(Role).default(Role.STUDENT),
});

/**
 * DEV-ONLY convenience login. This mints a valid JWT for any studentId with
 * no password check whatsoever — it exists purely so the prototype can be
 * demoed without wiring up a full identity provider. Replace this route
 * with your real ACEAPT auth (and delete this file) before this goes
 * anywhere near production; nothing else in the API depends on how the
 * token was minted, only that it verifies against JWT_SECRET.
 */
devAuthRouter.post("/dev-login", validateBody(schema), (req, res) => {
  if (config.nodeEnv === "production") {
    return res.status(404).json({ error: "Not available in production." });
  }
  const { studentId, role } = req.body as z.infer<typeof schema>;
  StudentRepository.ensure(studentId, studentId);
  const token = jwt.sign({ studentId, role }, config.jwtSecret, { expiresIn: "12h" });
  AuditService.log(studentId, "DEV_LOGIN", "auth", { role });
  res.json({ token });
});
