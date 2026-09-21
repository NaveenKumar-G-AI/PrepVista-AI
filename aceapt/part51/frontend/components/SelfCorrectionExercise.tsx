import React, { useState } from "react";
import { accuracyApi } from "../lib/api.js";

export interface SelfCorrectionExerciseProps {
  check: "PROBABILITY_RANGE" | "PERCENTAGE_RANGE" | "MAGNITUDE_SANITY" | "SIGN_CHECK" | "UNIT_CHECK";
  resultValue: number;
  prompt: string;
  onResolved?: (correct: boolean) => void;
}

/** §65 — "CHECK YOUR WORK" screen: shows the student's own result, asks the reasonableness question, never grades silently. */
export function SelfCorrectionExercise({ check, resultValue, prompt, onResolved }: SelfCorrectionExerciseProps) {
  const [outcome, setOutcome] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function answer(studentSaysFlag: boolean) {
    setSubmitting(true);
    try {
      const result = (await accuracyApi.selfCheck({ check, resultValue, studentSaysFlag })) as {
        correct: boolean;
        explanation: string;
      };
      setOutcome(result);
      onResolved?.(result.correct);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md border border-rule bg-paper p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Check your work</p>
      <p className="mt-2 text-sm text-ink-soft">Your result:</p>
      <p className="font-mono-tabular text-2xl font-semibold text-ink">{resultValue}</p>

      <p className="mt-4 text-base text-ink">{prompt}</p>

      {outcome === null ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => answer(true)}
            className="flex-1 border border-ink px-3 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => answer(false)}
            className="flex-1 border border-ink px-3 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            No
          </button>
        </div>
      ) : (
        <div className={`mt-4 border-l-4 ${outcome.correct ? "border-calibrated" : "border-attention"} bg-paper-raised p-3`}>
          <p className="text-sm font-medium text-ink">{outcome.correct ? "Good catch." : "Worth a second look."}</p>
          <p className="mt-1 text-sm text-ink-soft">{outcome.explanation}</p>
        </div>
      )}
    </div>
  );
}
