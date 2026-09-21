import { useState } from 'react';
import './HelpBar.css';

export function HelpBar({
  onHint,
  onExplain,
  onShowNext,
  onShowSolution,
  disabled,
}: {
  onHint: (note?: string) => void;
  onExplain: () => void;
  onShowNext: () => void;
  onShowSolution: () => void;
  disabled: boolean;
}) {
  const [note, setNote] = useState('');

  return (
    <div className="help-bar">
      <input
        className="help-bar__note"
        type="text"
        placeholder="Optional: what's tripping you up? (helps the hint aim better)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled}
      />
      <div className="help-bar__buttons">
        <button
          type="button"
          className="help-button"
          disabled={disabled}
          onClick={() => {
            onHint(note.trim() || undefined);
            setNote('');
          }}
        >
          Need a hint
        </button>
        <button type="button" className="help-button" disabled={disabled} onClick={onExplain}>
          Explain this step
        </button>
        <button type="button" className="help-button" disabled={disabled} onClick={onShowNext}>
          Show next step
        </button>
        <button type="button" className="help-button help-button--quiet" disabled={disabled} onClick={onShowSolution}>
          Show full solution
        </button>
      </div>
    </div>
  );
}
