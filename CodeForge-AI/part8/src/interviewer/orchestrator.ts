import { AIOrchestrator } from '../ai/aiProvider';
import {
  FollowUpQuestionSchema, FollowUpQuestion,
  ClarificationReplySchema, ClarificationReply,
  RestatementAssessmentSchema, RestatementAssessment,
  HintSchema, Hint,
} from '../ai/schemas';
import {
  systemPromptForInterviewer, followUpUserPrompt, clarificationUserPrompt,
  restatementUserPrompt, hintUserPrompt,
} from './prompts';
import { BlueprintVersionConfig, HintLevel } from '../types/domain';

export interface EventLogger {
  log(eventType: string, payload: Record<string, unknown>, createdBy: 'STUDENT' | 'SYSTEM' | 'AI' | 'INTERVIEWER'): Promise<void>;
}

/**
 * Every method here follows the same shape: build scoped context -> ask the
 * AIOrchestrator (which handles retry/fallback/validation) -> log the
 * outcome as evidence, including whether it was a real AI answer or the
 * deterministic fallback -> return the structured result. concludeInterview
 * and any other interviewer behaviors follow the identical pattern.
 */
export class InterviewerOrchestrator {
  constructor(private ai: AIOrchestrator, private events: EventLogger) {}

  async generateFollowUp(params: {
    targetRole: string;
    config: BlueprintVersionConfig;
    problemStatement: string;
    studentCode: string;
    language: string;
    testResults: { passed: boolean; summary: string };
    priorFollowUps: string[];
  }): Promise<FollowUpQuestion> {
    const outcome = await this.ai.completeWithFallback(
      {
        systemPrompt: systemPromptForInterviewer(params.config, params.targetRole),
        userPrompt: followUpUserPrompt(params),
      },
      FollowUpQuestionSchema,
      (): FollowUpQuestion => ({
        // A generic complexity question is always safe: it never invents
        // anything about the candidate's specific code.
        intent: 'FOLLOW_UP',
        focus: 'complexity',
        difficulty: 'easy',
        question: 'Can you walk me through the time and space complexity of your solution?',
        reason: 'Fallback question — the AI interviewer was unavailable for this turn.',
      }),
    );
    await this.events.log('FOLLOWUP_ASKED', {
      question: outcome.data.question,
      focus: outcome.data.focus,
      source: outcome.source,
      provider: outcome.provider ?? null,
    }, 'INTERVIEWER');
    return outcome.data;
  }

  async respondToClarification(params: {
    targetRole: string;
    config: BlueprintVersionConfig;
    problemStatement: string;
    constraints: string;
    studentQuestion: string;
  }): Promise<ClarificationReply> {
    const outcome = await this.ai.completeWithFallback(
      {
        systemPrompt: systemPromptForInterviewer(params.config, params.targetRole),
        userPrompt: clarificationUserPrompt(params),
      },
      ClarificationReplySchema,
      (): ClarificationReply => ({
        intent: 'CLARIFICATION_REPLY',
        answer: "Use exactly the constraints given in the problem statement — I can't add information beyond what's written there.",
        revealsSolution: false,
      }),
    );
    await this.events.log('CLARIFICATION_ANSWERED', {
      question: params.studentQuestion,
      answer: outcome.data.answer,
      source: outcome.source,
    }, 'INTERVIEWER');
    return outcome.data;
  }

  async evaluateRestatement(params: {
    targetRole: string;
    config: BlueprintVersionConfig;
    problemStatement: string;
    studentRestatement: string;
  }): Promise<RestatementAssessment> {
    const outcome = await this.ai.completeWithFallback(
      {
        systemPrompt: systemPromptForInterviewer(params.config, params.targetRole),
        userPrompt: restatementUserPrompt(params),
      },
      RestatementAssessmentSchema,
      (): RestatementAssessment => ({
        intent: 'RESTATEMENT_ASSESSMENT',
        correct: true, // conservative: never falsely fail a candidate because the AI was unavailable
        missedAspects: [],
        interviewerResponse: 'Thanks — let\'s move on to how you\'d approach this.',
      }),
    );
    await this.events.log('PROBLEM_RESTATED', {
      restatement: params.studentRestatement,
      correct: outcome.data.correct,
      missedAspects: outcome.data.missedAspects,
      source: outcome.source,
    }, 'STUDENT');
    return outcome.data;
  }

  async generateHint(params: {
    targetRole: string;
    config: BlueprintVersionConfig;
    problemStatement: string;
    studentCode: string;
    level: Exclude<HintLevel, 'NONE'>;
  }): Promise<Hint> {
    const outcome = await this.ai.completeWithFallback(
      {
        systemPrompt: systemPromptForInterviewer(params.config, params.targetRole),
        userPrompt: hintUserPrompt({ ...params, strugglingSince: new Date().toISOString() }),
      },
      HintSchema,
      (): Hint => ({
        intent: 'HINT',
        level: params.level,
        text: 'Try re-reading the constraints — is there a data structure that makes the lookup step faster?',
      }),
    );
    // Hints are always logged, regardless of source — PHASE 18: "Every hint
    // must be logged. Hints affect independence evidence."
    await this.events.log('HINT_REQUESTED', {
      level: outcome.data.level,
      text: outcome.data.text,
      source: outcome.source,
    }, 'INTERVIEWER');
    return outcome.data;
  }
}
