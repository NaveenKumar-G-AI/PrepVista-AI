import { BlueprintVersionConfig } from '../types/domain';

export function systemPromptForInterviewer(_config: BlueprintVersionConfig, targetRole: string): string {
  return [
    `You are a technical interviewer conducting a live coding interview for a ${targetRole} candidate.`,
    `Never reveal the algorithm, data structure, or solution before the candidate proposes one themselves.`,
    `When the candidate seems confused, ask a clarifying question back rather than giving the answer.`,
    `Ground every question strictly in the candidate's actual code, actual test results, and actual prior answers below — never invent facts about their submission.`,
    `Respond with ONLY a single JSON object matching the schema you're given. No prose, no markdown code fences.`,
  ].join('\n');
}

/**
 * PHASE 15: "Provide it with structured context... Do not provide
 * irrelevant repository information." Each of these builders takes exactly
 * the fields it needs, not a database dump.
 */

export function followUpUserPrompt(ctx: {
  problemStatement: string;
  studentCode: string;
  language: string;
  testResults: { passed: boolean; summary: string };
  priorFollowUps: string[];
}): string {
  return JSON.stringify({
    task: "Generate exactly one follow-up question grounded in the candidate's solution below.",
    problemStatement: ctx.problemStatement,
    language: ctx.language,
    studentCode: ctx.studentCode,
    testResults: ctx.testResults,
    priorFollowUpsAlreadyAsked: ctx.priorFollowUps,
    responseSchema: {
      intent: 'FOLLOW_UP',
      focus: 'complexity | edge_case | alternative_approach | optimization | data_structure_choice | scale',
      difficulty: 'easy | medium | hard',
      question: 'string',
      reason: "string — why this question is relevant to THIS candidate's actual solution",
    },
  });
}

export function clarificationUserPrompt(ctx: {
  problemStatement: string;
  constraints: string;
  studentQuestion: string;
}): string {
  return JSON.stringify({
    task: "Answer the candidate's clarification question using only the problem metadata given. Do not hint at the solution.",
    problemStatement: ctx.problemStatement,
    constraints: ctx.constraints,
    studentQuestion: ctx.studentQuestion,
    responseSchema: { intent: 'CLARIFICATION_REPLY', answer: 'string', revealsSolution: 'boolean' },
  });
}

export function restatementUserPrompt(ctx: {
  problemStatement: string;
  studentRestatement: string;
}): string {
  return JSON.stringify({
    task: "Assess whether the candidate's restatement of the problem is correct and complete.",
    problemStatement: ctx.problemStatement,
    studentRestatement: ctx.studentRestatement,
    responseSchema: {
      intent: 'RESTATEMENT_ASSESSMENT',
      correct: 'boolean',
      missedAspects: 'string[]',
      interviewerResponse: 'string — what the interviewer says next',
    },
  });
}

export function hintUserPrompt(ctx: {
  problemStatement: string;
  studentCode: string;
  level: 'CLARIFICATION' | 'CONCEPTUAL_DIRECTION' | 'STRONG_DIRECTION' | 'NEAR_SOLUTION';
  strugglingSince: string;
}): string {
  return JSON.stringify({
    task: `Give a hint at exactly the "${ctx.level}" level — no stronger. This will be logged against the candidate's independence evidence.`,
    problemStatement: ctx.problemStatement,
    studentCode: ctx.studentCode,
    hintLevel: ctx.level,
    responseSchema: { intent: 'HINT', level: ctx.level, text: 'string' },
  });
}
