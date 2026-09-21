import type {
  InterviewQuestion,
  InterviewResponse,
  StructuredEvaluation,
  ConfidenceBand,
  DepthLevel,
} from "../domain/types.js";
import type { SkillProgress } from "./coverageTracker.js";

const BAND_RANK: Record<ConfidenceBand, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

export type SkillProgressMap = Record<string, SkillProgress & { supportingEvaluationIds: string[] }>;

/** §46 input + §28 coverage input, both derived from the same source history. */
export function deriveSkillProgress(
  questions: InterviewQuestion[],
  responsesByQuestionId: Map<string, InterviewResponse>,
  latestEvaluationByResponseId: Map<string, StructuredEvaluation>
): SkillProgressMap {
  const progress: SkillProgressMap = {};
  for (const q of questions) {
    const p = (progress[q.skill] ??= { questionsAsked: 0, highestConfidence: null, supportingEvaluationIds: [] });
    p.questionsAsked += 1;
    const response = responsesByQuestionId.get(q.id);
    if (!response) continue;
    const evaluation = latestEvaluationByResponseId.get(response.id);
    if (!evaluation || evaluation.status !== "COMPLETED") continue;
    p.supportingEvaluationIds.push(evaluation.id);
    if (!p.highestConfidence || BAND_RANK[evaluation.evidenceConfidence] > BAND_RANK[p.highestConfidence]) {
      p.highestConfidence = evaluation.evidenceConfidence;
    }
  }
  return progress;
}

/** §13 diversity window — most-recently-asked skill first. */
export function recentSkillsMostRecentFirst(questions: InterviewQuestion[], window: number): string[] {
  return questions
    .slice(-window)
    .map((q) => q.skill)
    .reverse();
}

export interface CurrentTopicState {
  skill: string;
  depthLevel: DepthLevel;
  rootQuestionId: string;
  followUpsSoFarForTopic: number;
  retriesAtCurrentDepth: number;
}

/** §26-27 — reconstructs "how deep are we on the current topic, and how many retries have already happened at this depth" purely from the parent_question_id chain, so it survives a restart. */
export function analyzeCurrentTopic(questions: InterviewQuestion[]): CurrentTopicState | null {
  if (questions.length === 0) return null;
  const byId = new Map(questions.map((q) => [q.id, q]));
  const last = questions[questions.length - 1]!;

  const chain: InterviewQuestion[] = [last];
  let cursor = last;
  while (cursor.parentQuestionId) {
    const parent = byId.get(cursor.parentQuestionId);
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent;
  }

  let trailingSameDepthRun = 0;
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i]!.depthLevel === last.depthLevel) trailingSameDepthRun++;
    else break;
  }

  return {
    skill: last.skill,
    depthLevel: last.depthLevel,
    rootQuestionId: chain[0]!.id,
    followUpsSoFarForTopic: chain.length - 1,
    retriesAtCurrentDepth: trailingSameDepthRun - 1,
  };
}
