import { randomUUID } from "crypto";
import { Store } from "../db/store";
import { log } from "../events/eventBus";
import {
  applyEvidenceUpdate,
  computeAllCapabilityStates
} from "./state";
import { diagnoseAllTopics } from "./diagnosis";
import { buildCandidateActions } from "./candidateActions";
import { rankCandidates } from "./priority";
import { generatePlan } from "./plan";
import { buildExplanation } from "./explain";
import { getItemsForAction, stripAnswers } from "./contentBank";
import { detectFatigue } from "./signals";
import {
  ActionGradeResult,
  AdaptationEvent,
  AdaptivePlan,
  CandidateAction,
  ContentItem,
  ContentItemPublic,
  Diagnosis,
  NextActionExplanation,
  PendingExecution,
  PlanSessionRecord,
  SubmittedAnswer,
  TopicCapabilityState
} from "../types";

function statesAndDiagnoses(studentId: string): {
  states: TopicCapabilityState[];
  diagnoses: Diagnosis[];
  statesById: Map<string, TopicCapabilityState>;
} {
  const evidence = Store.getEvidence(studentId);
  const states = computeAllCapabilityStates(evidence);
  const diagnoses = diagnoseAllTopics(states);
  const statesById = new Map(states.map((s) => [s.topicId, s]));
  return { states, diagnoses, statesById };
}

export function getCapabilityState(studentId: string) {
  const { states, diagnoses } = statesAndDiagnoses(studentId);
  return { states, diagnoses };
}

function activeSessionExclusions(studentId: string): string[] {
  const session = Store.getPlanSession(studentId);
  // Only an explicit student-initiated skip removes a topic from
  // consideration this session (section 32). Completing an action does
  // NOT auto-exclude its topic - if the underlying bottleneck persists,
  // fresh re-diagnosis should be free to surface it again; if it resolved,
  // re-diagnosis naturally stops flagging it on its own. Forcing exclusion
  // on every completion regardless of outcome would silently hide a gap
  // that a wrong answer just confirmed was still real.
  return session ? [...session.skippedTopicIds] : [];
}

function getRanked(
  studentId: string,
  excludeTopicIds: string[] = []
): { ranked: CandidateAction[]; statesById: Map<string, TopicCapabilityState> } {
  const { diagnoses, statesById } = statesAndDiagnoses(studentId);
  const filtered = diagnoses.filter((d) => {
    const targetId = d.bottleneck === "PREREQUISITE_GAP" ? d.redirectTopicId ?? d.topicId : d.topicId;
    return !excludeTopicIds.includes(targetId);
  });
  const candidates = buildCandidateActions(filtered);
  const ranked = rankCandidates(candidates, statesById);
  log(studentId, "CANDIDATE_ACTIONS_GENERATED", `${candidates.length} candidate action(s) from ${filtered.length} diagnosis(es)`);
  log(studentId, "PRIORITIZATION_COMPLETED", `Ranked ${ranked.length} candidate(s) by expected value`);
  return { ranked, statesById };
}

export async function getNextAction(
  studentId: string
): Promise<{ action: CandidateAction | null; explanation: NextActionExplanation | null; allStable: boolean }> {
  const { ranked } = getRanked(studentId, activeSessionExclusions(studentId));
  if (ranked.length === 0) {
    log(studentId, "NEXT_ACTION_SELECTED", "All tracked topics are currently stable");
    return { action: null, explanation: null, allStable: true };
  }
  const top = ranked[0];
  const explanation = await buildExplanation(top);
  log(studentId, "NEXT_ACTION_SELECTED", `${top.actionType} - ${top.topicName}`, {
    candidateId: top.id,
    priorityScore: top.priorityScore
  });
  return { action: top, explanation, allStable: false };
}

function ensureSession(studentId: string, minutes: number, reset: boolean): PlanSessionRecord {
  const existing = Store.getPlanSession(studentId);
  if (!existing || reset || existing.totalMinutes !== minutes) {
    const fresh: PlanSessionRecord = {
      studentId,
      totalMinutes: minutes,
      remainingMinutes: minutes,
      completedTopicIds: [],
      skippedTopicIds: [],
      startedAt: new Date().toISOString(),
      lastActionResults: []
    };
    Store.setPlanSession(fresh);
    return fresh;
  }
  return existing;
}

export async function getAdaptivePlan(
  studentId: string,
  minutes: number,
  reset: boolean
): Promise<{ plan: AdaptivePlan; fatigueSuspected: boolean; fatigueMessage?: string }> {
  const session = ensureSession(studentId, minutes, reset);
  const { ranked, statesById } = getRanked(studentId, session.skippedTopicIds);

  const plan = generatePlan({
    studentId,
    totalMinutes: session.totalMinutes,
    remainingMinutes: session.remainingMinutes,
    rankedCandidates: ranked,
    allStatesById: statesById
  });

  log(studentId, "PLAN_GENERATED", `${plan.items.length} step(s) for the remaining ${session.remainingMinutes} min`, {
    itemCount: plan.items.length,
    remainingMinutes: session.remainingMinutes
  });

  const fatigueSuspected = detectFatigue(session.lastActionResults);
  return {
    plan,
    fatigueSuspected,
    fatigueMessage: fatigueSuspected
      ? "Accuracy is dipping and answers are taking longer than earlier in this session. A short break may help more than pushing straight through."
      : undefined
  };
}

export function startAction(
  studentId: string,
  candidateActionId: string
): { executionId: string; items: ContentItemPublic[] } | null {
  const { ranked } = getRanked(studentId, activeSessionExclusions(studentId));
  const candidate = ranked.find((c) => c.id === candidateActionId);
  if (!candidate) return null;

  const items: ContentItem[] = getItemsForAction(candidate.topicId, candidate.actionType, 3);
  const executionId = randomUUID();
  const pending: PendingExecution = {
    executionId,
    studentId,
    candidateActionId: candidate.id,
    topicId: candidate.topicId,
    topicName: candidate.topicName,
    actionType: candidate.actionType,
    bottleneck: candidate.bottleneck,
    estimatedMinutes: candidate.estimatedMinutes,
    items,
    startedAt: new Date().toISOString()
  };
  Store.savePendingExecution(pending);
  log(studentId, "ACTION_STARTED", `${candidate.actionType} - ${candidate.topicName}`, { executionId, candidateActionId });
  return { executionId, items: stripAnswers(items) };
}

function gradeAnswers(items: ContentItem[], answers: SubmittedAnswer[]): ActionGradeResult {
  let correctCount = 0;
  let totalTime = 0;
  for (const item of items) {
    const answer = answers.find((a) => a.itemId === item.id);
    if (answer && answer.selectedIndex === item.correctIndex) correctCount += 1;
    totalTime += answer?.responseTimeSeconds ?? 30;
  }
  const totalCount = items.length;
  return {
    correctCount,
    totalCount,
    accuracy: totalCount ? correctCount / totalCount : 0,
    avgResponseTimeSeconds: totalCount ? totalTime / totalCount : 0
  };
}

export interface CompleteActionResult {
  grade: ActionGradeResult;
  states: TopicCapabilityState[];
  diagnoses: Diagnosis[];
  next: { action: CandidateAction | null; explanation: NextActionExplanation | null; allStable: boolean };
  plan: { plan: AdaptivePlan; fatigueSuspected: boolean; fatigueMessage?: string } | null;
}

/**
 * The MEASURE -> UPDATE -> REPLAN half of the loop. Grading happens
 * entirely server-side against the pending execution's own stored items
 * (section 55: the client only ever sends raw selected answers, never a
 * claimed score).
 */
export async function completeAction(
  studentId: string,
  executionId: string,
  answers: SubmittedAnswer[]
): Promise<CompleteActionResult | null> {
  const pending = Store.getPendingExecution(executionId);
  if (!pending || pending.studentId !== studentId) return null;

  const grade = gradeAnswers(pending.items, answers);
  log(
    studentId,
    "ACTION_COMPLETED",
    `${pending.actionType} - ${pending.topicName}: ${grade.correctCount}/${grade.totalCount} correct`,
    { executionId, grade }
  );

  if (pending.topicId !== "mixed") {
    const evidenceList = Store.getEvidence(studentId);
    const evidence = evidenceList.find((e) => e.topicId === pending.topicId);
    if (evidence) {
      const updated = applyEvidenceUpdate(evidence, pending.bottleneck, grade);
      Store.updateTopicEvidence(studentId, pending.topicId, updated);
      log(studentId, "CAPABILITY_UPDATED", `${pending.topicName} evidence updated`, { topicId: pending.topicId });
    }
  }

  log(
    studentId,
    "RESULT_ANALYZED",
    `Accuracy ${(grade.accuracy * 100).toFixed(0)}%, avg ${grade.avgResponseTimeSeconds.toFixed(0)}s/question`
  );

  const session = Store.getPlanSession(studentId);
  if (session) {
    session.remainingMinutes = Math.max(0, session.remainingMinutes - pending.estimatedMinutes);
    if (!session.completedTopicIds.includes(pending.topicId)) {
      session.completedTopicIds = [...session.completedTopicIds, pending.topicId];
    }
    session.lastActionResults = [
      ...session.lastActionResults,
      { topicId: pending.topicId, accuracy: grade.accuracy, avgResponseTimeSeconds: grade.avgResponseTimeSeconds, at: new Date().toISOString() }
    ].slice(-10);
    Store.setPlanSession(session);
  }

  Store.deletePendingExecution(executionId);

  const { states, diagnoses } = statesAndDiagnoses(studentId);
  const next = await getNextAction(studentId);
  const refreshedSession = Store.getPlanSession(studentId);
  const plan = refreshedSession ? await getAdaptivePlan(studentId, refreshedSession.totalMinutes, false) : null;
  if (plan) {
    log(studentId, "PLAN_RECOMPUTED", `Plan recomputed after completing ${pending.topicName}`, {
      remainingMinutes: refreshedSession?.remainingMinutes
    });
  }

  return { grade, states, diagnoses, next, plan };
}

export async function skipAction(studentId: string, candidateActionId: string) {
  const topicId = candidateActionId.split("::")[0];
  log(studentId, "ACTION_SKIPPED", `Skipped ${candidateActionId}`, { candidateActionId });

  const session = Store.getPlanSession(studentId);
  if (session && !session.skippedTopicIds.includes(topicId)) {
    session.skippedTopicIds = [...session.skippedTopicIds, topicId];
    Store.setPlanSession(session);
  }

  const next = await getNextAction(studentId);
  const refreshedSession = Store.getPlanSession(studentId);
  const plan = refreshedSession ? await getAdaptivePlan(studentId, refreshedSession.totalMinutes, false) : null;
  return { next, plan };
}

export function getHistory(studentId: string): AdaptationEvent[] {
  return [...Store.getEvents(studentId)].reverse().slice(0, 100);
}

export function resetDemoData() {
  Store.resetToSeed();
}
