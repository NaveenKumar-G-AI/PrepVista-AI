import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import * as contactService from "../services/contactService.js";

const router = Router();
router.use(requireAuth);

const contactPatchSchema = z.object({
  name: z.string().min(1).optional(),
  designation: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  alternatePhone: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  preferredChannel: z.enum(["EMAIL", "PHONE", "WHATSAPP", "LINKEDIN", "OTHER"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const input = contactPatchSchema.parse(req.body);
    const contact = contactService.updateContact(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id, input);
    res.json({ contact });
  })
);

router.post(
  "/:id/set-primary",
  asyncRoute(async (req, res) => {
    contactService.setPrimaryContact(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/deactivate",
  asyncRoute(async (req, res) => {
    contactService.deactivateContact(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

export default router;
