import React, { useState } from "react";
import { accuracyApi } from "../lib/api.js";
import type { AttemptFeedback, SessionState } from "../lib/types.js";

export interface PrecisionTrainingSessionProps {
  sessionId: string;
  sequenceNumber: number;
  focusLabel: string; // e.g. "Strategy Selection" — humanized target error/intervention type
  questionPrompt: string;
  questionId: string;
  skillId: string;
  difficulty: "easy" | "medium" | "hard";
  hintLevel: "independent" | "guided" | "hint_used";
  isNovel?: boolean;
  /** The caller (host app) grades correctness against its own question bank / answer key — Feature 51 never invents an answer key. */
  gradeAnswer: (submittedAnswer: string) => { isCorrect: boolean; errorType?: string | null };
  onAdvance: (recommendedNextState: SessionState) => void;
}

/**
 * §108 mobile priority: current problem → current task → answer → feedback
 * → correction → next. One question on screen at a time, no dashboard
 * clutter. §64: feedback is never a blunt "Wrong" — it's whatever the
 * engine's deterministic-plus-AI-phrased message says.
 */
export function PrecisionTrainingSession({
  sessionId,
  sequenceNumber,
  focusLabel,
  questionPrompt,
  questionId,
  skillId,
  difficulty,
  hintLevel,
  isNovel,
  gradeAnswer,
  onAdvance
}: PrecisionTrainingSessionProps) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AttemptFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const graded = gradeAnswer(answer);
      const result = (await accuracyApi.submitAttempt(sessionId, sequenceNumber, {
        questionId,
        skillId,
        submittedAnswer: answer,
        isCorrect: graded.isCorrect,
        errorType: graded.errorType ?? null,
        difficulty,
        hintLevel,
        isNovel: isNovel ?? false
      })) as AttemptFeedback;
      setFeedback(result);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md border border-rule bg-paper p-5">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <span>Precision training</span>
        {hintLevel === "independent" && <span className="border border-accent px-1.5 py-0.5 text-accent">Independent</span>}
      </div>
      <p className="mt-1 text-sm text-ink-soft">Focus: {focusLabel}</p>

      <p className="mt-4 text-base leading-relaxed text-ink">{questionPrompt}</p>

      {feedback == null ? (
        <div className="mt-4">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer"
            className="w-full border border-rule bg-paper px-3 py-2 text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={submitting || answer.trim().length === 0}
            onClick={submit}
            className="mt-3 w-full border border-ink py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <div
            className={`border-l-4 p-3 ${feedback.attempt.isCorrect ? "border-calibrated bg-calibrated-soft" : "border-attention bg-attention-soft"}`}
          >
            <p className="text-sm font-medium text-ink">{feedback.attempt.isCorrect ? "Correct." : "Not quite."}</p>
            <p className="mt-1 text-sm text-ink-soft">{feedback.message}</p>
            {feedback.policyDecision?.rationale && (
              <p className="mt-2 text-xs text-ink-soft">{feedback.policyDecision.rationale}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onAdvance(feedback.recommendedNextState)}
            className="mt-3 w-full border border-ink py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper"
          >
            {feedback.recommendedNextState === "COMPLETED" ? "Finish" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}
