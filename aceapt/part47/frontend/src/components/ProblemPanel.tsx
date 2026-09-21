import type { SessionView } from '../api/types.js';
import './ProblemPanel.css';

export function ProblemPanel({ session }: { session: SessionView }) {
  return (
    <header className="problem-panel">
      <div className="problem-panel__meta">
        <span className="problem-panel__label">{session.mode === 'VERIFICATION' ? 'Independent verification' : 'Guided solving'}</span>
        <span className="problem-panel__type">{session.problemType.replace(/_/g, ' ')}</span>
      </div>
      <h1 className="problem-panel__title">{session.problemTitle}</h1>
      <p className="problem-panel__prompt">{session.problemPromptText}</p>
    </header>
  );
}
