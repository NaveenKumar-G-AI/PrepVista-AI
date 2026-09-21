import type { AttemptFinalStatus, EventType } from "../domain/types.js";

export interface SimulationEventInput {
  questionId: string | null; // null for simulation-level events
  eventType: EventType;
  eventTimestamp: string; // ISO 8601
  payload: {
    selectedOptionId?: string;
    /** Active time (seconds) attributable to this question since the
     * previous event for it — client-tracked, paused on navigation away.
     * Summed per question to produce timeSpentSeconds. */
    timeSpentDeltaSeconds?: number;
    section?: string;
  };
}

export interface ReconciledAttempt {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  timeSpentSeconds: number;
  firstViewedAt: string | null;
  answeredAt: string | null;
  skipCount: number;
  revisitCount: number;
  finalStatus: AttemptFinalStatus;
}

export interface QuestionKey {
  questionId: string;
  correctOptionId: string;
}

/**
 * The event log is the source of truth; per-question rows are always
 * *derived* from it, never written directly by the client. This is what lets
 * Section 44 ("never create false readiness conclusions" from bad data) hold
 * even if a client sends duplicate, out-of-order, or partial events — we
 * always fold the full history for a question down to one canonical answer:
 * the last selection recorded before submission, whatever order events
 * arrived in.
 */
export function reconcileAttempts(
  events: SimulationEventInput[],
  questionsInSim: QuestionKey[]
): ReconciledAttempt[] {
  const correctByQuestion = new Map(questionsInSim.map((q) => [q.questionId, q.correctOptionId]));
  const eventsByQuestion = new Map<string, SimulationEventInput[]>();
  for (const q of questionsInSim) eventsByQuestion.set(q.questionId, []);

  for (const e of events) {
    if (!e.questionId) continue;
    const list = eventsByQuestion.get(e.questionId);
    if (list) list.push(e); // events for a question outside this simulation are ignored defensively
  }

  const results: ReconciledAttempt[] = [];

  for (const [questionId, qEvents] of eventsByQuestion) {
    const sorted = [...qEvents].sort((a, b) => a.eventTimestamp.localeCompare(b.eventTimestamp));

    let firstViewedAt: string | null = null;
    let lastSelectedOptionId: string | null = null;
    let answeredAt: string | null = null;
    let skipCount = 0;
    let revisitCount = 0;
    let timeSpentSeconds = 0;
    let wasExplicitlySkippedLast = false;

    for (const e of sorted) {
      timeSpentSeconds += Math.max(0, e.payload.timeSpentDeltaSeconds ?? 0);

      switch (e.eventType) {
        case "QUESTION_VIEWED":
          if (!firstViewedAt) firstViewedAt = e.eventTimestamp;
          break;
        case "QUESTION_REVISITED":
          revisitCount += 1;
          wasExplicitlySkippedLast = false;
          break;
        case "QUESTION_SKIPPED":
          skipCount += 1;
          wasExplicitlySkippedLast = true;
          break;
        case "QUESTION_ANSWERED":
        case "QUESTION_SUBMITTED":
          if (e.payload.selectedOptionId) {
            lastSelectedOptionId = e.payload.selectedOptionId;
            answeredAt = e.eventTimestamp;
            wasExplicitlySkippedLast = false;
          }
          break;
        default:
          break;
      }
    }

    let finalStatus: AttemptFinalStatus;
    let isCorrect: boolean | null;
    if (lastSelectedOptionId) {
      finalStatus = "answered";
      isCorrect = lastSelectedOptionId === correctByQuestion.get(questionId);
    } else if (wasExplicitlySkippedLast) {
      finalStatus = "skipped";
      isCorrect = null;
    } else {
      finalStatus = "unanswered";
      isCorrect = null;
    }

    results.push({
      questionId,
      selectedOptionId: lastSelectedOptionId,
      isCorrect,
      timeSpentSeconds: Math.round(timeSpentSeconds),
      firstViewedAt,
      answeredAt,
      skipCount,
      revisitCount,
      finalStatus,
    });
  }

  return results;
}
