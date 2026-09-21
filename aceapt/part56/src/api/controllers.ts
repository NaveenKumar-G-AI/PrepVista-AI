import { Request, Response } from 'express';
import { z } from 'zod';
import { FormulaRegistry } from '../registry/formulaRegistry';
import { FormulaGraphService } from '../graph/formulaGraphService';
import { FormulaStudentStateService } from '../state/formulaStudentStateService';
import { FormulaTrainingEngine, NotFoundError } from '../training/formulaTrainingEngine';
import { ConfusionDetector } from '../confusion/confusionDetector';
import { AttemptInput } from '../types';

/** Express 5 types route params as `string | string[]` (path-to-regexp v8 allows repeated segments); our routes never use repeated params, so this just narrows back to a plain string. */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? '');
}

export interface Controllers {
  getFormula: (req: Request, res: Response) => Promise<void>;
  listFormulas: (req: Request, res: Response) => Promise<void>;
  searchFormulas: (req: Request, res: Response) => Promise<void>;
  getRelationships: (req: Request, res: Response) => Promise<void>;
  startSession: (req: Request, res: Response) => Promise<void>;
  getNextActivity: (req: Request, res: Response) => Promise<void>;
  submitAttempt: (req: Request, res: Response) => Promise<void>;
  getProfile: (req: Request, res: Response) => Promise<void>;
  getWeaknesses: (req: Request, res: Response) => Promise<void>;
}

const startSessionSchema = z.object({
  studentId: z.string().min(1),
  formulaId: z.string().min(1),
  assessmentMode: z.boolean().optional(),
  tenantId: z.string().optional(),
});

// Deliberately permissive at the shape level (most fields optional, matching
// AttemptInput) - the engine itself decides which fields are relevant to a
// given activityType and treats missing ones as "not checked" rather than
// erroring, so e.g. a MAP attempt does not need to supply APPLY-only fields.
const attemptSchema = z.object({
  activityType: z.enum(['RECOGNIZE', 'RECALL', 'SELECT', 'MAP', 'APPLY', 'VERIFY', 'TRANSFER', 'RETAIN']),
  presentedFormulaId: z.string().min(1),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  novelty: z.enum(['FAMILIAR', 'NOVEL']).optional(),
  responseTimeMs: z.number().optional(),
  hintLevel: z.number().optional(),
  correctFormulaId: z.string().optional(),
  chosenFormulaId: z.string().optional(),
  wasDiscriminationDrill: z.boolean().optional(),
  expectedMapping: z.record(z.string(), z.number()).optional(),
  submittedMapping: z.record(z.string(), z.number()).optional(),
  expectedTargetVariable: z.string().optional(),
  expectedAnswer: z.number().optional(),
  submittedAnswer: z.number().optional(),
  answerTolerance: z.number().optional(),
  usedRearrangedForm: z.string().optional(),
  expectedRearrangedForm: z.string().optional(),
  verificationExpected: z.boolean().optional(),
  verificationSubmitted: z.boolean().optional(),
});

export function buildControllers(deps: {
  registry: FormulaRegistry;
  graphService: FormulaGraphService;
  stateService: FormulaStudentStateService;
  trainingEngine: FormulaTrainingEngine;
  confusionDetector: ConfusionDetector;
}): Controllers {
  const { registry, graphService, stateService, trainingEngine, confusionDetector } = deps;

  async function withNotFoundHandling(res: Response, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  }

  return {
    async getFormula(req, res) {
      await withNotFoundHandling(res, async () => {
        const formula = await registry.getFormula(param(req.params.id));
        if (!formula) {
          res.status(404).json({ error: 'Not found.' });
          return;
        }

        // Restricted-assessment clients only ever get a status stub back -
        // full formula content (meaning, conditions, relationships) is
        // never served through this endpoint mid-assessment (spec sections
        // 85, 172, 232). Enforced here, not just left to the frontend to
        // respect - a client cannot get around it by calling the library
        // endpoint directly. Apply the same guard to any other
        // content-bearing formula route you add later.
        if (req.header('x-assessment-mode') === 'true') {
          res.json({ formulaId: formula.formulaId, status: formula.status });
          return;
        }

        const relationships = await graphService.getRelationships(formula.formulaId);
        res.json({ ...formula, relationships });
      });
    },

    async listFormulas(req, res) {
      const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined;
      const formulas = domain ? await registry.listByDomain(domain) : await registry.listByStatus('PUBLISHED');
      res.json({ formulas });
    },

    async searchFormulas(req, res) {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const formulas = await registry.searchFormulas(q);
      res.json({ formulas });
    },

    async getRelationships(req, res) {
      const relationships = await graphService.getRelationships(param(req.params.id));
      res.json({ relationships });
    },

    async startSession(req, res) {
      const parsed = startSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      await withNotFoundHandling(res, async () => {
        const session = await trainingEngine.startSession(parsed.data.studentId, parsed.data.formulaId, {
          assessmentMode: parsed.data.assessmentMode,
          tenantId: parsed.data.tenantId,
        });
        res.status(201).json(session);
      });
    },

    async getNextActivity(req, res) {
      await withNotFoundHandling(res, async () => {
        const directive = await trainingEngine.getNextActivity(param(req.params.sessionId));
        res.json(directive);
      });
    },

    async submitAttempt(req, res) {
      const parsed = attemptSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      await withNotFoundHandling(res, async () => {
        const input: AttemptInput = { sessionId: param(req.params.sessionId), ...parsed.data };
        const feedback = await trainingEngine.submitAttempt(param(req.params.sessionId), input);
        res.json(feedback);
      });
    },

    async getProfile(req, res) {
      const profile = await stateService.getProfile(param(req.params.studentId));
      res.json({ studentId: param(req.params.studentId), formulas: profile });
    },

    async getWeaknesses(req, res) {
      const profile = await stateService.getProfile(param(req.params.studentId));
      const weak = profile
        .map((p) => ({
          formulaId: p.formulaId,
          weakDimensions: Object.entries(p.dimensions)
            .filter(([, status]) => status === 'NEEDS_ATTENTION')
            .map(([dim]) => dim),
          regressionFlag: p.regressionFlag,
        }))
        .filter((p) => p.weakDimensions.length > 0 || p.regressionFlag);

      const confusionPairs = await confusionDetector.getTopConfusionPairs(param(req.params.studentId));
      res.json({ studentId: param(req.params.studentId), weak, confusionPairs });
    },
  };
}
