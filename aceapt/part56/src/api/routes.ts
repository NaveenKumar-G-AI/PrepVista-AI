import { Router } from 'express';
import { Controllers } from './controllers';
import { attachAuthContext, requireRole, requireSelfOrRole } from './middleware';

export function buildFormulaRouter(controllers: Controllers): Router {
  const router = Router();
  router.use(attachAuthContext);

  // Formula library - left open (no auth) in this scaffold since browsing
  // canonical content in learning mode is not sensitive; the enforcement
  // point for restricted assessments is the x-assessment-mode guard inside
  // getFormula, not a login wall. Tighten this to match your real access
  // model.
  router.get('/formulas', controllers.listFormulas);
  router.get('/formulas/search', controllers.searchFormulas);
  router.get('/formulas/:id', controllers.getFormula);
  router.get('/formulas/:id/relationships', controllers.getRelationships);

  // Training. Known limitation (see docs/INTEGRATION.md): these routes do
  // not yet verify the caller is the student in question - add a
  // requireSelfOrRole('studentId', ...) style guard once sessions carry an
  // authenticated studentId end to end.
  router.post('/training/sessions', controllers.startSession);
  router.get('/training/sessions/:sessionId/next', controllers.getNextActivity);
  router.post('/training/sessions/:sessionId/attempts', controllers.submitAttempt);

  // Student-facing analytics - a student may only read their own profile;
  // staff roles can read any (spec section 155: never expose individual
  // students to other students, while trainers/admins legitimately can).
  router.get(
    '/students/:studentId/formula-profile',
    requireSelfOrRole('studentId', 'TRAINER', 'ADMIN', 'SYSTEM'),
    controllers.getProfile,
  );
  router.get(
    '/students/:studentId/formula-weaknesses',
    requireSelfOrRole('studentId', 'TRAINER', 'ADMIN', 'SYSTEM'),
    controllers.getWeaknesses,
  );

  // Admin/content - canonical content changes require a content role (spec
  // sections 146, 174, 235). This route demonstrates the guard; wire real
  // status-change logic to your content-management flow.
  router.patch('/admin/formulas/:id/status', requireRole('CONTENT_EDITOR', 'ADMIN'), (_req, res) => {
    res.status(501).json({ error: 'Not implemented in this scaffold - wire to your content management flow.' });
  });

  return router;
}
