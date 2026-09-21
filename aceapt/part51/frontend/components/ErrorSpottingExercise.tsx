import React, { useState } from "react";

export interface ErrorSpottingExerciseProps {
  steps: Array<{ step: number; content: string }>;
  onSubmit: (selectedStep: number) => Promise<{ correct: boolean; correctStep: number | null }>;
}

/** §23/§66 — trains error DETECTION: the student marks where the reasoning first breaks, not just what the final answer should be. */
export function ErrorSpottingExercise({ steps, onSubmit }: ErrorSpottingExerciseProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; correctStep: number | null } | null>(null);

  async function submit() {
    if (selected == null) return;
    setResult(await onSubmit(selected));
  }

  return (
    <div className="max-w-lg border border-rule bg-paper p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Find the first error</p>
      <p className="mt-1 text-sm text-ink-soft">Which step first breaks the reasoning?</p>

      <ol className="mt-3 space-y-1.5">
        {steps.map((s) => {
          const isSelected = selected === s.step;
          const isCorrectStep = result != null && result.correctStep === s.step;
          const isWrongPick = result != null && isSelected && !result.correct;
          return (
            <li key={s.step}>
              <button
                type="button"
                disabled={result != null}
                onClick={() => setSelected(s.step)}
                className={[
                  "flex w-full items-start gap-3 border px-3 py-2 text-left text-sm transition",
                  isCorrectStep ? "border-calibrated bg-calibrated-soft" : isWrongPick ? "border-regressed bg-regressed-soft" : isSelected ? "border-accent bg-accent-soft" : "border-rule hover:border-ink"
                ].join(" ")}
              >
                <span className="font-mono-tabular text-ink-soft">{s.step}</span>
                <span className="text-ink">{s.content}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {result == null ? (
        <button
          type="button"
          disabled={selected == null}
          onClick={submit}
          className="mt-4 border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          Submit
        </button>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          {result.correct ? "That's the first break in the reasoning." : `The first break was step ${result.correctStep}.`}
        </p>
      )}
    </div>
  );
}
