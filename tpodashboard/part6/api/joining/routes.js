'use strict';

/**
 * NOT EXECUTED IN THIS BUILD - see api/offers/routes.js header for why.
 */
function joiningRoutes({ joiningService, joiningRepo, authz }) {
  // eslint-disable-next-line global-require
  const { Router } = require('express');
  const router = Router();

  // --- Student endpoints ---------------------------------------------

  router.get('/mine', authz.requireRole(['STUDENT']), (req, res) => {
    const record = joiningRepo.getByOfferId(req.query.offerId);
    if (!record || record.studentId !== req.user.studentId) return res.status(404).end();
    res.json(record);
  });

  router.post('/:id/confirm', authz.requireOwnerOrRole([]), (req, res) => {
    res.json(joiningService.confirmJoining(req.params.id, { actor: req.user.id }));
  });

  router.post('/:id/submit-evidence', authz.requireOwnerOrRole([]), (req, res) => {
    res.json(
      joiningService.submitEvidence(req.params.id, {
        actor: req.user.id,
        evidenceDocumentId: req.body.evidenceDocumentId,
      })
    );
  });

  // --- TPO endpoints ---------------------------------------------------

  router.get('/pending', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(joiningService.getPendingJoining(joiningRepo.listAll()));
  });

  router.get('/did-not-join', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(joiningService.getDidNotJoin(joiningRepo.listAll()));
  });

  router.post('/:id/verify', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    // Only path that can produce JOINED - a TPO user id is required
    // (joiningService throws ACTOR_REQUIRED otherwise).
    res.json(joiningService.verifyJoined(req.params.id, { actor: req.user.id }));
  });

  router.post('/:id/delay', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(
      joiningService.markDelayed(req.params.id, {
        actor: req.user.id,
        newExpectedDate: req.body.newExpectedDate,
        reason: req.body.reason,
      })
    );
  });

  router.post('/:id/did-not-join', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(
      joiningService.markDidNotJoin(req.params.id, {
        actor: req.user.id,
        reasonCategory: req.body.reasonCategory,
        remarks: req.body.remarks,
      })
    );
  });

  return router;
}

module.exports = { joiningRoutes };
