import { Router } from "express";
import * as repo from "../../db/repository.js";
import { asyncHandler } from "../asyncHandler.js";

export const profilesRouter = Router();

profilesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const profiles = await repo.listAssessmentProfiles();
    res.json({ profiles });
  })
);

profilesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const profile = await repo.getAssessmentProfile(req.params.id as string);
    if (!profile) {
      res.status(404).json({ error: "Assessment profile not found" });
      return;
    }
    res.json({ profile });
  })
);
