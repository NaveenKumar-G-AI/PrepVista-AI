import { randomUUID } from 'node:crypto';
import {
  AttemptFeedback,
  AttemptInput,
  Difficulty,
  FormulaErrorType,
  FormulaTrainingAttempt,
  FormulaTrainingSession,
  Novelty,
  SupportLevel,
  TrainingActivityType,
} from '../types';
import { FormulaRegistry } from '../registry/formulaRegistry';
import { FormulaGraphService } from '../graph/formulaGraphService';
import { FormulaStudentStateService } from '../state/formulaStudentStateService';
import { FormulaTrainingPolicy } from './formulaTrainingPolicy';
import { classifyFormulaError } from '../errors/formulaErrorClassifier';
import { TrainingAttemptRepository, TrainingSessionRepository } from '../repositories';
import { AIGatewayPort, buildSafeCoachingPrompt } from '../integrations/ports';

export class NotFoundError extends Error {}

export interface ActivityDirective {
  sessionId: string;
  activityType: TrainingActivityType;
  formulaId: string;
  restricted: boolean;
  supportLevel?: SupportLevel;
  difficulty?: Difficulty;
  novelty?: Novelty;
  discriminationCandidateFormulaIds?: string[];
  reason?: string;
}

const CANNED_EXPLANATIONS: Record<FormulaErrorType, string> = {
  FORMULA_RECALL_ERROR: 'The relationship itself needs more retrieval practice - try recalling it before looking it up.',
  FORMULA_SELECTION_ERROR: 'A different, unrelated formula was chosen. Re-read what the problem is actually describing before picking a formula.',
  FORMULA_CONDITION_ERROR: "The chosen formula is real and related, but its condition doesn't match this problem - compare what each formula assumes.",
  VARIABLE_MAPPING_ERROR: 'The right formula was chosen, but a value went into the wrong variable. Double-check what each symbol stands for.',
  FORMULA_REARRANGEMENT_ERROR: 'The canonical formula is right, but the rearranged form used to solve for this variable was not.',
  FORMULA_APPLICATION_ERROR: 'The formula and mapping were right - the slip was in the calculation itself.',
  FORMULA_VERIFICATION_ERROR: "The final answer doesn't satisfy the original relationship - plug it back in to check.",
  FORMULA_TRANSFER_ERROR: 'This works on familiar problems but not yet on this changed version - practice with varied wording and structure.',
  FORMULA_RETENTION_ERROR: 'This was solid earlier but has faded - a quick spaced review should bring it back.',
};

/**
 * Orchestrates a formula training session (spec sections 57-66, 167,
 * 187-192). Deliberately does not author question content - see the
 * AttemptInput doc comment in src/types/index.ts and docs/INTEGRATION.md.
 * getNextActivity returns a *directive* (what to train, at what
 * difficulty/novelty/support level, against which confusable candidates);
 * the calling layer combines that with your validated Question Bank to
 * actually show the student something.
 */
export class FormulaTrainingEngine {
  constructor(
    private readonly registry: FormulaRegistry,
    private readonly graphService: FormulaGraphService,
    private readonly stateService: FormulaStudentStateService,
    private readonly policy: FormulaTrainingPolicy,
    private readonly attemptRepo: TrainingAttemptRepository,
    private readonly sessionRepo: TrainingSessionRepository,
  ) {}

  async startSession(
    studentId: string,
    formulaId: string,
    opts: { assessmentMode?: boolean; tenantId?: string } = {},
  ): Promise<FormulaTrainingSession> {
    const formula = await this.registry.getFormula(formulaId, { includeUnpublished: true });
    if (!formula) throw new NotFoundError(`Unknown formula: ${formulaId}`);

    const session: FormulaTrainingSession = {
      sessionId: randomUUID(),
      studentId,
      formulaId,
      tenantId: opts.tenantId,
      assessmentMode: opts.assessmentMode ?? false,
      startedAt: new Date(),
    };
    await this.sessionRepo.saveSession(session);
    return session;
  }

  async getNextActivity(sessionId: string): Promise<ActivityDirective> {
    const session = await this.sessionRepo.getSession(sessionId);
    if (!session) throw new NotFoundError(`Unknown session: ${sessionId}`);

    if (session.assessmentMode) {
      // Strict mode: no candidate reveal, no adaptive support fading, no
      // "why" explanation beyond the bare activity type (spec sections 49,
      // 85, 172, 232). This branch is the enforcement point - a client
      // cannot get discrimination candidates or a support level out of
      // this engine while assessmentMode is true, no matter what it asks
      // for.
      return {
        sessionId,
        activityType: 'APPLY',
        formulaId: session.formulaId,
        restricted: true,
      };
    }

    const decision = await this.policy.decideNext(session.studentId, session.formulaId, sessionId);
    return { sessionId, restricted: false, ...decision };
  }

  async submitAttempt(sessionId: string, input: AttemptInput): Promise<AttemptFeedback> {
    const session = await this.sessionRepo.getSession(sessionId);
    if (!session) throw new NotFoundError(`Unknown session: ${sessionId}`);

    const attributedFormulaId = this.resolveAttributedFormulaId(input);
    const formula = await this.registry.getFormula(attributedFormulaId, { includeUnpublished: true });
    if (!formula) throw new NotFoundError(`Unknown formula: ${attributedFormulaId}`);

    let chosenFormulaRelatedToExpected: boolean | undefined;
    if (
      input.activityType === 'SELECT' &&
      input.correctFormulaId &&
      input.chosenFormulaId &&
      input.correctFormulaId !== input.chosenFormulaId
    ) {
      chosenFormulaRelatedToExpected = await this.graphService.areRelatedOrConfusable(
        input.correctFormulaId,
        input.chosenFormulaId,
      );
    }

    const formulaCorrect = this.formulaCorrectCheck(input);
    const mappingCorrect = this.mappingCorrectCheck(input);
    const rearrangementCorrect = this.rearrangementCorrectCheck(input);
    const arithmeticCorrect = this.arithmeticCorrectCheck(input);
    const verificationCorrect = this.verificationCorrectCheck(input);

    const errorType = classifyFormulaError({
      activityType: input.activityType,
      formulaCorrect,
      chosenFormulaRelatedToExpected,
      mappingCorrect,
      rearrangementCorrect,
      arithmeticCorrect,
      verificationCorrect,
    });

    const correct = this.isFullyCorrect([formulaCorrect, mappingCorrect, rearrangementCorrect, arithmeticCorrect, verificationCorrect]);

    const attempt: FormulaTrainingAttempt = {
      id: randomUUID(),
      sessionId,
      studentId: session.studentId,
      formulaId: attributedFormulaId,
      formulaVersionAtAttempt: formula.version,
      activityType: input.activityType,
      correct,
      errorType,
      distractorFormulaId: input.activityType === 'SELECT' && !correct ? input.chosenFormulaId : undefined,
      involvedConfusionPair:
        input.activityType === 'SELECT' && (input.wasDiscriminationDrill === true || chosenFormulaRelatedToExpected === true)
          ? true
          : undefined,
      responseTimeMs: input.responseTimeMs,
      hintLevel: input.hintLevel,
      difficulty: input.difficulty,
      novelty: input.novelty,
      createdAt: new Date(),
    };

    await this.attemptRepo.saveAttempt(attempt);
    const state = await this.stateService.applyAttempt(attempt);

    return {
      correct,
      errorType,
      message: correct ? 'Correct.' : this.explainMistake(errorType),
      supportLevel: state.supportLevel,
    };
  }

  /** Deterministic, always-available explanation (spec sections 106, 231). */
  explainMistake(errorType: FormulaErrorType | null): string {
    return errorType ? CANNED_EXPLANATIONS[errorType] : 'Not quite - take another look.';
  }

  /**
   * Optional AI-personalized phrasing of the same explanation. If the
   * gateway throws or is otherwise unavailable, falls back to the
   * deterministic explanation unchanged - AI absence must never break core
   * functionality (spec sections 106, 231).
   */
  async explainMistakeWithAI(errorType: FormulaErrorType | null, ai: AIGatewayPort): Promise<string> {
    const canned = this.explainMistake(errorType);
    try {
      const prompt = buildSafeCoachingPrompt(
        'Rephrase this formula-mistake feedback in one warm, specific sentence for a student. Do not invent new facts.',
        canned,
      );
      return await ai.complete(prompt);
    } catch {
      return canned;
    }
  }

  private resolveAttributedFormulaId(input: AttemptInput): string {
    if ((input.activityType === 'RECALL' || input.activityType === 'SELECT') && input.correctFormulaId) {
      return input.correctFormulaId;
    }
    return input.presentedFormulaId;
  }

  private formulaCorrectCheck(input: AttemptInput): boolean | undefined {
    if (input.activityType !== 'RECALL' && input.activityType !== 'SELECT') return undefined;
    if (input.correctFormulaId === undefined || input.chosenFormulaId === undefined) return undefined;
    return input.correctFormulaId === input.chosenFormulaId;
  }

  private mappingCorrectCheck(input: AttemptInput): boolean | undefined {
    if (!input.expectedMapping || !input.submittedMapping) return undefined;
    const keys = Object.keys(input.expectedMapping);
    return keys.every((k) => input.submittedMapping?.[k] === input.expectedMapping?.[k]);
  }

  private rearrangementCorrectCheck(input: AttemptInput): boolean | undefined {
    if (!input.expectedRearrangedForm || !input.usedRearrangedForm) return undefined;
    return input.expectedRearrangedForm.replace(/\s+/g, '') === input.usedRearrangedForm.replace(/\s+/g, '');
  }

  private arithmeticCorrectCheck(input: AttemptInput): boolean | undefined {
    if (input.expectedAnswer === undefined || input.submittedAnswer === undefined) return undefined;
    const tolerance = input.answerTolerance ?? 1e-6;
    return Math.abs(input.expectedAnswer - input.submittedAnswer) <= tolerance * Math.max(1, Math.abs(input.expectedAnswer));
  }

  private verificationCorrectCheck(input: AttemptInput): boolean | undefined {
    if (input.verificationExpected === undefined || input.verificationSubmitted === undefined) return undefined;
    return input.verificationExpected === input.verificationSubmitted;
  }

  private isFullyCorrect(checks: Array<boolean | undefined>): boolean {
    const defined = checks.filter((c): c is boolean => c !== undefined);
    if (defined.length === 0) return false;
    return defined.every(Boolean);
  }
}
