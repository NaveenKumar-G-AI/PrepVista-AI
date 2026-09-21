// Every system prompt below repeats the same non-negotiable rule
// (spec section 56) because each is used in an isolated API call:
// speak only from the supplied facts, never invent student activity,
// results, deadlines, or feedback, and say so plainly when the given
// facts are thin rather than padding the answer.

const TRUST_RULE =
  "You explain and organize facts you are given about a student's career preparation. " +
  "You must never invent activity, completions, scores, deadlines, feedback, or skills that are not " +
  "present in the JSON provided. If the JSON does not support a claim, omit the claim rather than guessing. " +
  "Keep language plain, specific, and encouraging without being saccharine. Never use guilt, shame, or " +
  "urgency-manufacturing language (no 'you're falling behind', no 'you failed').";

export interface RationaleContext {
  goalTitle: string;
  targetRole: string;
  actionTitle: string;
  actionType: string;
  bottleneckName: string | null;
  opportunityTitle: string | null;
  opportunityDaysAway: number | null;
  isFollowUpToWeakEvidence: boolean;
  weakEvidenceSummary: string | null;
}

export function rationaleSystemPrompt(): string {
  return (
    TRUST_RULE +
    " Output strict JSON only, no prose outside the JSON, no markdown fences. Shape: " +
    '{"summary": string (max 20 words, one sentence, no trailing period-less clause), ' +
    '"bullets": string[] (2-4 short bullets, each under 12 words, starting with a capital letter, no leading symbols)}.'
  );
}

export function rationaleUserPrompt(ctx: RationaleContext): string {
  return `Explain briefly why this is the recommended next action.\n\n${JSON.stringify(ctx, null, 2)}`;
}

export interface DecomposeContext {
  targetRole: string;
  goalTitle: string;
}

export function decomposeSystemPrompt(): string {
  return (
    TRUST_RULE +
    " You are decomposing a career goal into a realistic execution path for a student. " +
    "Output strict JSON only, no prose outside the JSON, no markdown fences. Shape: " +
    '{"milestones": [{"title": string, "weeklyObjective": string, ' +
    '"actions": [{"title": string, "description": string (one sentence), ' +
    '"actionType": "SIMULATION"|"PRACTICE"|"CONCEPT_SESSION"|"REVIEW"|"PROJECT_WORK"|"REFLECTION", ' +
    '"estimatedMinutes": number, "capabilityArea": string}]}]}. ' +
    "Produce exactly 2 milestones, each with exactly 1 weekly objective and 3-5 small, concrete, individually " +
    "completable actions (never a single vague task like 'prepare for interviews'). " +
    "estimatedMinutes must be between 15 and 60."
  );
}

export function decomposeUserPrompt(ctx: DecomposeContext): string {
  return `Decompose this goal into milestones, a weekly objective per milestone, and concrete actions.\n\n${JSON.stringify(
    ctx,
    null,
    2
  )}`;
}

export interface BlockerContext {
  actionTitle: string;
  actionType: string;
  reasonCode: string;
  reasonNote: string | null;
  goalTitle: string;
}

export function blockerSystemPrompt(): string {
  return (
    TRUST_RULE +
    " A student reported being blocked on an action. Propose ONE small unblocking action that removes the " +
    "specific obstacle, sized to be finishable before returning to the original action. " +
    "Output strict JSON only, no prose outside the JSON, no markdown fences. Shape: " +
    '{"unblockTitle": string, "unblockDescription": string (one sentence), ' +
    '"estimatedMinutes": number (10-30), "explanation": string (max 20 words, why this unblocks it)}.'
  );
}

export function blockerUserPrompt(ctx: BlockerContext): string {
  return `Propose an unblocking action.\n\n${JSON.stringify(ctx, null, 2)}`;
}

export interface WeeklyNarrativeContext {
  goalTitle: string;
  targetRole: string;
  weekStart: string;
  recommended: number;
  completed: number;
  measured: number;
  deferred: number;
  blocked: number;
  capabilityChanges: { name: string; trend: string }[];
  currentBottleneck: string | null;
  upcomingDeadlineDays: number | null;
}

export function weeklyNarrativeSystemPrompt(): string {
  return (
    TRUST_RULE +
    " Write a short weekly career-execution summary for the student, 2-3 sentences, plain prose (not JSON, no " +
    "markdown, no headers, no bullet points). Ground every sentence in the numbers given; do not speculate " +
    "about causes not evidenced in the data."
  );
}

export function weeklyNarrativeUserPrompt(ctx: WeeklyNarrativeContext): string {
  return `Summarize this student's week.\n\n${JSON.stringify(ctx, null, 2)}`;
}
