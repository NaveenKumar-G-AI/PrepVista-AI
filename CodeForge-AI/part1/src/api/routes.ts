import { Router } from 'express';
import type { RoleService } from '../services/roleService.js';
import type { CareerContextService } from '../services/careerContextService.js';
import { careerContextUpdateSchema } from '../domain/validation.js';
import { InvalidCareerContextError, ResourceNotFoundError } from './errors.js';

export function buildRoutes(roleService: RoleService, careerContextService: CareerContextService): Router {
  const router = Router();

  // --- Catalog (read-only for students; no mutation endpoints exist at
  // all for roles/competencies/skills/technologies — Step 49) ---

  // NOTE: /search and /compare are registered before /:roleSlug so Express
  // does not swallow them as a role slug.
  router.get('/roles/search', (req, res) => {
    const q = String(req.query.q ?? '');
    res.json({ results: roleService.search(q) });
  });

  router.get('/roles/compare', (req, res, next) => {
    try {
      const a = String(req.query.a ?? '');
      const b = String(req.query.b ?? '');
      res.json(roleService.compare(a, b));
    } catch (err) {
      next(err);
    }
  });

  router.get('/roles', (_req, res) => {
    res.json({ roles: roleService.listActiveRoles() });
  });

  router.get('/roles/:roleSlug', (req, res, next) => {
    try {
      res.json(roleService.getRoleRequirements(req.params.roleSlug));
    } catch (err) {
      next(err);
    }
  });

  router.get('/roles/:roleSlug/competencies', (req, res, next) => {
    try {
      res.json({ competencies: roleService.getRoleRequirements(req.params.roleSlug).competencies });
    } catch (err) {
      next(err);
    }
  });

  router.get('/roles/:roleSlug/skills', (req, res, next) => {
    try {
      res.json({ skills: roleService.getRoleRequirements(req.params.roleSlug).skills });
    } catch (err) {
      next(err);
    }
  });

  // --- Student career context (always "mine" — never accepts a studentId
  // from the caller, which is what prevents one student from reading or
  // writing another's context; Step 49/50) ---

  router.get('/student/career-context', (req, res) => {
    res.json(careerContextService.getContext(req.auth!.studentId));
  });

  router.put('/student/career-context', (req, res, next) => {
    const parsed = careerContextUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new InvalidCareerContextError(parsed.error.issues.map((i) => i.message).join('; ')));
    }
    try {
      const result = careerContextService.setContext(req.auth!.studentId, parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/student/career-context/history', (req, res) => {
    res.json({ history: careerContextService.getHistory(req.auth!.studentId) });
  });

  // --- Institution-scoped extension point (Step 34-36, 50) ---

  router.get('/institutions/:institutionId/role-variants', (req, res, next) => {
    try {
      // Tenant check happens here, not just "can this institution be
      // found" — a student from another institution gets the same
      // RESOURCE_NOT_FOUND a nonexistent institution would produce, so a
      // cross-tenant probe cannot distinguish the two (Step 57).
      if (req.auth!.institutionId !== req.params.institutionId) {
        throw new ResourceNotFoundError();
      }
      res.json({ variants: roleService.getRoleVariants(req.params.institutionId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
