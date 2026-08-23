import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import * as companyService from "../services/companyService.js";
import * as contactService from "../services/contactService.js";
import * as activityService from "../services/activityService.js";
import * as followupService from "../services/followupService.js";
import * as noteService from "../services/noteService.js";
import * as lookupService from "../services/lookupService.js";
import * as aiContext from "../services/aiContextService.js";
import { RELATIONSHIP_STAGES } from "../types.js";

const router = Router();
router.use(requireAuth);

const companyInputSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().nullable().optional(),
  brandName: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  industryId: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  headquartersCity: z.string().nullable().optional(),
  headquartersState: z.string().nullable().optional(),
  headquartersCountry: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  relationshipOwnerId: z.string().nullable().optional(),
});

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const q = req.query;
    const result = companyService.listCompanies(req.db, req.auth!.institutionId, {
      search: typeof q.search === "string" ? q.search : undefined,
      industryId: typeof q.industryId === "string" ? q.industryId : undefined,
      city: typeof q.city === "string" ? q.city : undefined,
      relationshipStage: typeof q.stage === "string" ? (q.stage as any) : undefined,
      ownerId: typeof q.ownerId === "string" ? q.ownerId : undefined,
      repeatRecruiter: q.repeatRecruiter === "true",
      followupStatus: typeof q.followupStatus === "string" ? (q.followupStatus as any) : undefined,
      includeArchived: q.includeArchived === "true",
      sort: typeof q.sort === "string" ? (q.sort as any) : undefined,
      sortDir: typeof q.sortDir === "string" ? (q.sortDir as any) : undefined,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    });
    res.json(result);
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = companyInputSchema.parse(req.body);
    const allowDuplicate = req.query.allowDuplicate === "true";
    const { company, duplicates } = companyService.createCompany(req.db, req.auth!.institutionId, req.auth!.userId, input, {
      allowDuplicate,
    });
    res.status(201).json({ company, possibleDuplicates: duplicates });
  })
);

router.get(
  "/relationship-stages",
  asyncRoute(async (_req, res) => {
    res.json({ stages: RELATIONSHIP_STAGES });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const context = aiContext.getCompanyContext(req.db, req.auth!.institutionId, req.params.id);
    const tags = lookupService.listCompanyTags(req.db, req.params.id);
    const drives = companyService.getCompanyDrives(req.db, req.params.id);
    res.json({ ...context, tags, drives, requirements: [], hiringHistory: [] });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const input = companyInputSchema.partial().parse(req.body);
    const company = companyService.updateCompany(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id, input);
    res.json({ company });
  })
);

router.post(
  "/:id/archive",
  asyncRoute(async (req, res) => {
    companyService.archiveCompany(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/restore",
  asyncRoute(async (req, res) => {
    companyService.restoreCompany(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

const stageSchema = z.object({ stage: z.enum(RELATIONSHIP_STAGES as [string, ...string[]]), reason: z.string().optional() });
router.post(
  "/:id/stage",
  asyncRoute(async (req, res) => {
    const { stage, reason } = stageSchema.parse(req.body);
    const company = companyService.changeRelationshipStage(
      req.db,
      req.auth!.institutionId,
      req.auth!.userId,
      req.params.id,
      stage as any,
      reason
    );
    res.json({ company });
  })
);

router.get(
  "/:id/history",
  asyncRoute(async (req, res) => {
    res.json({ history: aiContext.getCompanyHistory(req.db, req.auth!.institutionId, req.params.id) });
  })
);

// --- Contacts nested under a company -----------------------------------------------

const contactInputSchema = z.object({
  name: z.string().min(1),
  designation: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  alternatePhone: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  preferredChannel: z.enum(["EMAIL", "PHONE", "WHATSAPP", "LINKEDIN", "OTHER"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

router.get(
  "/:id/contacts",
  asyncRoute(async (req, res) => {
    res.json({ contacts: contactService.listContacts(req.db, req.auth!.institutionId, req.params.id) });
  })
);

router.post(
  "/:id/contacts",
  asyncRoute(async (req, res) => {
    const input = contactInputSchema.parse(req.body);
    const contact = contactService.createContact(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id, input);
    res.status(201).json({ contact });
  })
);

// --- Activities nested under a company ---------------------------------------------

const activityInputSchema = z.object({
  contactId: z.string().nullable().optional(),
  type: z.enum([
    "CALL",
    "EMAIL",
    "MEETING",
    "VISIT",
    "RECRUITER_REQUEST",
    "REQUIREMENT_RECEIVED",
    "DRIVE_DISCUSSION",
    "FOLLOWUP",
    "NOTE",
    "OTHER",
  ]),
  subject: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  occurredAt: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
});

router.get(
  "/:id/activities",
  asyncRoute(async (req, res) => {
    res.json({ activities: activityService.listActivity(req.db, req.auth!.institutionId, req.params.id) });
  })
);

router.post(
  "/:id/activities",
  asyncRoute(async (req, res) => {
    const input = activityInputSchema.parse(req.body);
    const activity = activityService.logActivity(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id, input);
    res.status(201).json({ activity });
  })
);

// --- Follow-ups nested under a company ----------------------------------------------

const followupInputSchema = z.object({
  contactId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  dueAt: z.string().min(1),
});

router.get(
  "/:id/followups",
  asyncRoute(async (req, res) => {
    const rows = followupService.listFollowupsForCompany(req.db, req.auth!.institutionId, req.params.id);
    res.json({ followups: rows.map((f) => ({ ...f, displayStatus: followupService.displayStatus(f) })) });
  })
);

router.post(
  "/:id/followups",
  asyncRoute(async (req, res) => {
    const input = followupInputSchema.parse(req.body);
    const followup = followupService.createFollowup(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id, input);
    res.status(201).json({ followup });
  })
);

// --- Notes nested under a company ----------------------------------------------------

router.get(
  "/:id/notes",
  asyncRoute(async (req, res) => {
    res.json({ notes: noteService.listNotes(req.db, req.auth!.institutionId, req.params.id) });
  })
);

router.post(
  "/:id/notes",
  asyncRoute(async (req, res) => {
    const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
    const note = noteService.createNote(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id, body);
    res.status(201).json({ note });
  })
);

export default router;
