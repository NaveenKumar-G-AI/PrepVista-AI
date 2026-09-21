import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { ProblemSummary } from '../api/types.js';
import './ProblemPicker.css';

export function ProblemPicker({ onPick }: { onPick: (problemId: string) => void }) {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProblems()
      .then((res) => setProblems(res.problems))
      .catch(() => setError('Could not reach the Guided Solving backend. Is it running on the configured VITE_API_BASE_URL?'));
  }, []);

  return (
    <div className="problem-picker">
      <div className="problem-picker__intro">
        <p className="problem-picker__eyebrow">Guided Solving Engine</p>
        <h1>Pick a problem to work through</h1>
        <p className="problem-picker__lede">
          You will work one step at a time. Help is there when you want it, but the goal is a problem you can solve on your
          own next time.
        </p>
      </div>

      {error && <p className="problem-picker__error">{error}</p>}

      {!problems && !error && <p className="problem-picker__loading">Loading problems…</p>}

      {problems && (
        <ul className="problem-picker__list">
          {problems.map((p) => (
            <li key={p.problemId}>
              <button className="problem-card" onClick={() => onPick(p.problemId)}>
                <span className="problem-card__type">{p.type.replace(/_/g, ' ')}</span>
                <span className="problem-card__title">{p.title}</span>
                <span className="problem-card__prompt">{p.promptText}</span>
                <span className="problem-card__cta">Start solving →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
