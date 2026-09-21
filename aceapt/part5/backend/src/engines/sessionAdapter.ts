import { DifficultyDecision } from "./difficultyEngine";
import { AdaptationEvent, Attempt, PracticeSession } from "../domain/types";

/**
 * Applies a DifficultyDecision to the live session (§20). Only produces a
 * visible AdaptationEvent when something actually changed — small
 * "hold difficulty, correct and on pace" turns don't spam the student with
 * adaptation banners, only real pivots do (e.g. Hard→Medium+ with a
 * calculation focus after the calc-error miss in the reference demo script).
 */
export function applyAdaptation(
  session: PracticeSession,
  decision: DifficultyDecision,
  attempt: Attempt
): AdaptationEvent | null {
  const previousDifficulty = session.currentDifficulty;
  session.currentDifficulty = decision.nextDifficulty;
  session.currentFocusDimension = decision.focusDimension;

  if (!decision.triggeredAdaptation) {
    return null;
  }

  const event: AdaptationEvent = {
    atQuestionIndex: attempt.questionIndexInSession,
    trigger: buildTrigger(attempt, decision),
    previousDifficulty,
    newDifficulty: decision.nextDifficulty,
    focusDimension: decision.focusDimension,
    newObjectiveFocus: decision.questionTypeBias?.join(", "),
    message: decision.rationale,
    createdAt: new Date().toISOString(),
  };

  session.adaptationLog.push(event);
  return event;
}

function buildTrigger(attempt: Attempt, decision: DifficultyDecision): string {
  if (attempt.isCorrect) {
    return `Correct, ${attempt.relativeSpeed.toLowerCase()} response at question ${attempt.questionIndexInSession}`;
  }
  return `Incorrect (${attempt.errorCategory ?? "UNKNOWN"}) at question ${attempt.questionIndexInSession}, delta ${decision.delta}`;
}
