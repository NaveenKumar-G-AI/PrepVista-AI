import { useState } from 'react';
import type { FullSolutionView, ReconstructionResult } from '../api/types.js';
import './FullSolutionPanel.css';

export function FullSolutionPanel({
  solution,
  reconstructionResult,
  onSubmitReconstruction,
  loading,
}: {
  solution: FullSolutionView;
  reconstructionResult: ReconstructionResult | null;
  onSubmitReconstruction: (answers: Record<string, string>) => void;
  loading: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  return (
    <section className="full-solution">
      <h2 className="full-solution__title">Full solution</h2>
      <ol className="full-solution__steps">
        {solution.steps.map((s) => (
          <li key={s.stepId}>
            <p className="full-solution__objective">{s.objective}</p>
            <p className="full-solution__explanation">{s.explanation}</p>
            <p className="full-solution__answer">
              Answer: <span>{s.answer}</span>
            </p>
          </li>
        ))}
      </ol>

      <div className="full-solution__reconstruction">
        <h3>Now, in your own words</h3>
        <p className="full-solution__reconstruction-lede">
          Seeing a solution is not the same as being able to produce one. Answer these before moving on.
        </p>
        {solution.reconstructionPrompts.map((p) => {
          const result = reconstructionResult?.results.find((r) => r.promptId === p.promptId);
          return (
            <label key={p.promptId} className="reconstruction-field">
              <span>{p.prompt}</span>
              <input
                type="text"
                value={answers[p.promptId] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [p.promptId]: e.target.value }))}
                disabled={loading}
              />
              {result && (
                <span className={`reconstruction-field__mark ${result.correct ? 'reconstruction-field__mark--ok' : ''}`}>
                  {result.correct ? 'Matches the method used' : 'Not quite - compare with the steps above'}
                </span>
              )}
            </label>
          );
        })}
        <button type="button" className="answer-input__submit" disabled={loading} onClick={() => onSubmitReconstruction(answers)}>
          Check my answers
        </button>
      </div>
    </section>
  );
}
