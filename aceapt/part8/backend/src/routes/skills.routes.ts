import { Router } from "express";
import { withServiceScope } from "../lib/db.js";
import { listSkills } from "../repositories/skillRepository.js";
import { requireAuth } from "../middleware/auth.js";

export const skillsRouter = Router();

// Skill catalog is not student-specific data, so no RLS/ownership concern -
// service pool is appropriate. Still behind auth so only logged-in students
// (of this reference build) can browse it.
skillsRouter.get("/", requireAuth, async (_req, res, next) => {
  try {
    const skills = await withServiceScope((client) => listSkills(client));
    res.json({ skills });
  } catch (err) {
    next(err);
  }
});
