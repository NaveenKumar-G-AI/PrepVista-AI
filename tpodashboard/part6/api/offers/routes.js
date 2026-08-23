'use strict';

/**
 * NOT EXECUTED IN THIS BUILD - Express isn't installed in the sandbox
 * this reference was built in (no network access to npm install it).
 * This file is a wiring reference showing how offerService plugs into
 * a REST layer; the logic it calls into (offerService.js) IS tested.
 *
 * Wire up with: app.use('/api/offers', offerRoutes(deps))
 *
 * @param {{offerService: ReturnType<import('../../services/offers/offerService').createOfferService>, offerRepo: object, authz: object}} deps
 */
function offerRoutes({ offerService, offerRepo, authz }) {
  // eslint-disable-next-line global-require
  const { Router } = require('express');
  const router = Router();

  // --- TPO endpoints -----------------------------------------------------

  router.post('/', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    const result = offerService.createOffer({
      input: req.body,
      actor: req.user.id,
      allowUnselectedOverride: Boolean(req.body.allowUnselectedOverride),
      existingOffers: offerRepo.listByStudent(req.body.studentId),
    });
    if (!result.ok) return res.status(409).json({ error: 'CONFLICTS_FOUND', conflicts: result.conflicts });
    res.status(201).json(result.offer);
  });

  router.post('/bulk-import/preview', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    // req.body.rows are already parsed (see services/offers/bulkImport.js
    // docstring) - actual CSV/XLSX parsing is the host app's existing
    // import infra, not reimplemented here.
    const { validateImportRows } = require('../../services/offers/bulkImport');
    const result = validateImportRows(req.body.rows, req.app.locals.importResolvers);
    res.json(result);
  });

  router.post('/bulk-import/commit', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    // Expects the SAME `valid` array a prior /preview call returned, so
    // the TPO is committing exactly what they reviewed - never re-derive
    // it from raw rows at commit time (spec section 62: never partially
    // import silently; the preview the human approved is authoritative).
    const results = req.body.validRows.map(({ offer }) =>
      offerService.createOffer({ input: offer, actor: req.user.id, existingOffers: [] })
    );
    const failed = results.filter((r) => !r.ok);
    res.status(failed.length > 0 ? 207 : 201).json({ created: results.length - failed.length, failed });
  });

  router.post('/:id/receive', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(offerService.receiveOffer(req.params.id, { actor: req.user.id }));
  });

  router.post('/:id/start-verification', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(offerService.startVerification(req.params.id, { actor: req.user.id }));
  });

  router.post('/:id/verify', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    const offer = offerRepo.getById(req.params.id);
    const result = offerService.verifyOffer(req.params.id, {
      actor: req.user.id,
      existingOffers: offerRepo.listByStudent(offer.studentId),
    });
    res.json(result);
  });

  router.post('/:id/publish', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    const offer = offerRepo.getById(req.params.id);
    try {
      const published = offerService.publishOffer(req.params.id, {
        actor: req.user.id,
        studentOffers: offerRepo.listByStudent(offer.studentId),
      });
      res.json(published);
    } catch (err) {
      if (err.code === 'MULTIPLE_OFFER_POLICY_BLOCKED') {
        return res.status(409).json({ error: err.code, reasons: err.reasons });
      }
      throw err;
    }
  });

  router.post('/:id/correct', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(
      offerService.correctOffer(req.params.id, {
        actor: req.user.id,
        fieldChanges: req.body.fieldChanges,
        reason: req.body.reason,
      })
    );
  });

  router.post('/:id/withdraw', authz.requireRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(offerService.withdrawOffer(req.params.id, { actor: req.user.id, reason: req.body.reason }));
  });

  // --- Student endpoints (own offers only - enforced by authz, section 57) ---

  router.get('/mine', authz.requireRole(['STUDENT']), (req, res) => {
    res.json(offerRepo.listByStudent(req.user.studentId));
  });

  router.get('/:id', authz.requireOwnerOrRole(['TPO_HEAD', 'PLACEMENT_OFFICER']), (req, res) => {
    res.json(offerRepo.getById(req.params.id));
  });

  router.post('/:id/accept', authz.requireOwnerOrRole([]), (req, res) => {
    const offer = offerRepo.getById(req.params.id);
    try {
      const result = offerService.acceptOffer(req.params.id, {
        actor: req.user.id,
        studentOffers: offerRepo.listByStudent(offer.studentId),
      });
      res.json(result);
    } catch (err) {
      if (err.code === 'ILLEGAL_OFFER_TRANSITION') {
        // Most commonly a double-submit / already-decided offer.
        return res.status(409).json({ error: err.code, message: 'This offer already has a decision recorded.' });
      }
      if (err.code === 'MULTIPLE_OFFER_POLICY_BLOCKED') {
        return res.status(409).json({ error: err.code, reasons: err.reasons });
      }
      throw err;
    }
  });

  router.post('/:id/decline', authz.requireOwnerOrRole([]), (req, res) => {
    res.json(
      offerService.declineOffer(req.params.id, {
        actor: req.user.id,
        reasonCategory: req.body.reasonCategory,
        reasonNote: req.body.reasonNote,
      })
    );
  });

  return router;
}

module.exports = { offerRoutes };
