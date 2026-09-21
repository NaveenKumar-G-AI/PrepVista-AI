import { Router } from 'express';
import { randomUUID } from 'crypto';
import { computeDiffRegions, summarizeDiff } from '../diff/diffEngine';
import { generateFindings } from '../findings/findingEngine';
import { deriveDecision, summarize } from '../review/decisionEngine';
import { reReviewFindings, pairRegressions } from '../review/reReviewEngine';
import { assessResponse, evaluateDisagreement, suggestedTransitionFor } from '../review/responseEngine';
import { transition } from '../findings/lifecycle';
import { store } from './store';
import { requireUser, rateLimit, asyncHandler } from './middleware';
import type { ReviewMessage, ResponseType, SourceFile, ReviewSession } from '../domain/types';

export const router = Router();

router.post('/reviews', requireUser, rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { baseFiles, targetFiles, problemContext } = req.body as {
    baseFiles?: SourceFile[];
    targetFiles?: SourceFile[];
    problemContext?: ReviewSession['problemContext'];
  };

  if (!Array.isArray(baseFiles) || !Array.isArray(targetFiles)) {
    return res.status(400).json({ error: 'baseFiles and targetFiles (arrays of {path, content}) are required' });
  }

  const diffRegions = computeDiffRegions(baseFiles, targetFiles);
  const reviewId = randomUUID();

  // NOTE: no correctness/complexity/quality evidenceProviders are wired here
  // because this standalone service has no execution engine of its own — see
  // analysis/evidenceAdapter.ts. Pass real providers in when this route is
  // ported into the actual CodeForge backend.
  const { findings, testsPassing } = await generateFindings({
    reviewId,
    diffRegions,
    baseFiles,
    targetFiles,
    problemContext,
    targetRevisionId: reviewId,
  });

  const { filesChanged, linesChanged } = summarizeDiff(diffRegions);
  const decision = deriveDecision(findings, testsPassing);

  const review: ReviewSession = {
    id: reviewId,
    baseRevisionId: 'base',
    targetRevisionId: 'target',
    problemContext,
    changeClassification: 'REFACTOR',
    mode: 'LEARNING',
    persona: 'PR_REVIEWER',
    findings,
    decision,
    analysisVersion: '1.0.0',
    rulesVersion: '1.0.0',
    createdAt: new Date().toISOString(),
  };

  store.saveReview(review, userId);
  store.addEvent({ id: randomUUID(), reviewId, type: 'review_created', payload: { findingCount: findings.length }, createdAt: new Date().toISOString() });

  res.status(201).json({ review, summary: summarize(findings, filesChanged, linesChanged) });
}));

router.get('/reviews/:id', requireUser, (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const review = store.getReview(req.params.id, userId);
  if (!review) return res.status(404).json({ error: 'not found' });
  res.json({ review });
});

router.post('/reviews/:id/findings/:findingId/respond', requireUser, rateLimit(30, 60_000), (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const review = store.getReview(req.params.id, userId);
  if (!review) return res.status(404).json({ error: 'not found' });

  const finding = review.findings.find((f) => f.id === req.params.findingId);
  if (!finding) return res.status(404).json({ error: 'finding not found' });

  const { responseType, content } = req.body as { responseType: ResponseType; content: string };
  if (!responseType || !content) return res.status(400).json({ error: 'responseType and content are required' });

  const message: ReviewMessage = {
    id: randomUUID(),
    findingId: finding.id,
    author: 'developer',
    responseType,
    content,
    createdAt: new Date().toISOString(),
  };
  store.addMessage(finding.id, message);

  const assessment = assessResponse(content, finding);
  const disagreement = responseType === 'DISAGREE' ? evaluateDisagreement(content, finding) : undefined;

  const nextStatus = suggestedTransitionFor(responseType);
  if (nextStatus) {
    finding.status = transition(finding.status, nextStatus);
    finding.updatedAt = new Date().toISOString();
    store.updateFinding(review.id, userId, finding);
  }

  store.addEvent({
    id: randomUUID(),
    reviewId: review.id,
    type: 'response_posted',
    payload: { findingId: finding.id, responseType },
    createdAt: new Date().toISOString(),
  });

  res.json({ message, assessment, disagreement, finding });
});

router.post('/reviews/:id/re-review', requireUser, rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const review = store.getReview(req.params.id, userId);
  if (!review) return res.status(404).json({ error: 'not found' });

  const { baseFiles, targetFiles, stillFailingEvidenceIds } = req.body as {
    baseFiles?: SourceFile[];
    targetFiles?: SourceFile[];
    stillFailingEvidenceIds?: string[];
  };
  if (!Array.isArray(baseFiles) || !Array.isArray(targetFiles)) {
    return res.status(400).json({ error: 'baseFiles and targetFiles are required' });
  }

  const diffRegions = computeDiffRegions(baseFiles, targetFiles);

  // Run the deterministic analyzers on the new diff FIRST. Any evidence id
  // they reconfirm (complexity/duplication/quality — categories this engine
  // can independently re-verify) is proof the issue is still present, so it
  // doesn't need the caller to say so. Evidence this engine can't recompute
  // itself (correctness, since Feature 16 isn't wired into this standalone
  // demo) still relies on the caller-supplied stillFailingEvidenceIds — that
  // boundary is intentional, not an oversight: Code Review Mode must not
  // reimplement the correctness engine.
  const { findings: freshFindings, testsPassing } = await generateFindings({
    reviewId: review.id,
    diffRegions,
    baseFiles,
    targetFiles,
    problemContext: review.problemContext,
    targetRevisionId: randomUUID(),
  });
  const autoReconfirmedIds = new Set(freshFindings.flatMap((f) => f.evidence.map((e) => e.id)));
  const combinedStillFailing = new Set([...(stillFailingEvidenceIds ?? []), ...autoReconfirmedIds]);

  const reReview = reReviewFindings(review.findings, diffRegions, combinedStillFailing, targetFiles);

  for (const r of reReview) {
    const f = review.findings.find((x) => x.id === r.findingId);
    if (!f) continue;
    if (r.outcome === 'RESOLVED') f.status = transition(f.status, 'RESOLVED');
    if (r.outcome === 'REGRESSED') f.status = transition(f.status, 'REOPENED');
  }

  const genuinelyNew = freshFindings.filter((nf) => !review.findings.some((ef) => ef.fingerprint === nf.fingerprint));
  review.findings.push(...genuinelyNew);

  const regressions = pairRegressions(reReview, review.findings, genuinelyNew);
  const decision = deriveDecision(review.findings, testsPassing);
  review.decision = decision;
  store.saveReview(review, userId);
  store.addEvent({
    id: randomUUID(),
    reviewId: review.id,
    type: 'review_re_run',
    payload: { reReviewCount: reReview.length, newFindingCount: genuinelyNew.length },
    createdAt: new Date().toISOString(),
  });

  res.json({ reReview, newFindings: genuinelyNew, regressions, decision });
}));

router.get('/reviews/:id/decision', requireUser, (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const review = store.getReview(req.params.id, userId);
  if (!review) return res.status(404).json({ error: 'not found' });
  res.json({ decision: review.decision });
});

router.get('/reviews/:id/events', requireUser, (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const review = store.getReview(req.params.id, userId);
  if (!review) return res.status(404).json({ error: 'not found' });
  res.json({ events: store.getEvents(review.id) });
});
