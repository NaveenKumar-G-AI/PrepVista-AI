import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { AppError, httpStatusForError } from '../../domain/errors';
import { recordEvidence } from '../../repositories/evidenceRepo';
import { recalculate } from '../../repositories/roadmapRepo';
import type { AuthedRequest } from '../auth';

export const evidenceRouter = Router();

const EvidenceSchema = z.object({
  skillId: z.string().min(1),
  source: z.enum(['CHALLENGE_ATTEMPT', 'VERIFICATION', 'EXPLORATION']),
  outcome: z.enum(['SUCCESS', 'PARTIAL', 'FAIL']),
  independent: z.boolean().default(true),
  difficulty: z.string().optional(),
  language: z.string().optional(),
  failureCategory: z.enum(['LOGIC', 'SYNTAX', 'TIMEOUT', 'RUNTIME_ERROR']).optional(),
  timeTakenSeconds: z.number().int().positive().optional(),
  challengeRef: z.string().optional(),
});

evidenceRouter.post('/', (req: AuthedRequest, res) => {
  const db = getDb();
  const studentId = req.auth!.studentId; // never trust a client-supplied studentId in the body
  const parsed = EvidenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'validation_error', details: parsed.error.flatten() });

  const skillExists = db.prepare(`SELECT 1 FROM skills WHERE id = ?`).get(parsed.data.skillId);
  if (!skillExists) return res.status(404).json({ error: 'unknown skillId' });

  const masteryState = recordEvidence(db, { studentId, ...parsed.data });

  try {
    const { changed, version } = recalculate(db, studentId, 'EVIDENCE_UPDATE');
    res.status(201).json({ masteryState, roadmapChanged: changed, roadmapVersion: version });
  } catch (err) {
    if (err instanceof AppError) {
      // No active target yet — evidence is still recorded, roadmap just isn't generated.
      return res.status(201).json({ masteryState, roadmapChanged: false, roadmapVersion: null, note: err.message });
    }
    throw err;
  }
});
