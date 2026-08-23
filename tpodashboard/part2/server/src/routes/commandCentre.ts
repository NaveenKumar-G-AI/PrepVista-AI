import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { getRecruiterPulse } from "../services/commandCentreService.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/recruiter-pulse",
  asyncRoute(async (req, res) => {
    res.json(getRecruiterPulse(req.db, req.auth!.institutionId));
  })
);

export default router;
