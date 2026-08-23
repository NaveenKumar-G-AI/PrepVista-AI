import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import * as lookupService from "../services/lookupService.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/industries",
  asyncRoute(async (req, res) => {
    res.json({ industries: lookupService.listIndustries(req.db, req.auth!.institutionId) });
  })
);

router.post(
  "/industries",
  asyncRoute(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const industry = lookupService.createIndustry(req.db, req.auth!.institutionId, name);
    res.status(201).json({ industry });
  })
);

router.get(
  "/tags",
  asyncRoute(async (req, res) => {
    res.json({ tags: lookupService.listTags(req.db, req.auth!.institutionId) });
  })
);

router.post(
  "/tags",
  asyncRoute(async (req, res) => {
    const { name, color } = z.object({ name: z.string().min(1), color: z.string().optional() }).parse(req.body);
    const tag = lookupService.createTag(req.db, req.auth!.institutionId, name, color);
    res.status(201).json({ tag });
  })
);

router.post(
  "/companies/:companyId/tags/:tagId",
  asyncRoute(async (req, res) => {
    lookupService.tagCompany(req.db, req.params.companyId, req.params.tagId, req.auth!.userId);
    res.json({ ok: true });
  })
);

router.delete(
  "/companies/:companyId/tags/:tagId",
  asyncRoute(async (req, res) => {
    lookupService.untagCompany(req.db, req.params.companyId, req.params.tagId);
    res.json({ ok: true });
  })
);

export default router;
