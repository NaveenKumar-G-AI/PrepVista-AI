import type { DecisionProfileDisplay } from '../types';
import './DecisionDashboardPanel.css';

/** §109-111, §140: only measured dimensions are shown — an absent dimension
 *  means "not enough data yet", never "zero" or "bad". */
export interface DecisionDashboardPanelProps {
  profile: DecisionProfileDisplay;
  onTrain?: () => void;
}

type DimensionKey = Exclude<keyof DecisionProfileDisplay, 'currentFocus'>;

const DIMENSION_LABELS: { key: DimensionKey; label: string }[] = [
  { key: 'elimination', label: 'Elimination' },
  { key: 'informedGuessing', label: 'Informed guessing' },
  { key: 'strategicSkipping', label: 'Strategic skipping' },
  { key: 'timeAllocation', label: 'Time allocation' },
  { key: 'confidenceCalibration', label: 'Confidence calibration' },
  { key: 'answerSwitching', label: 'Answer switching' },
];

function defaultProfile(): DecisionProfileDisplay {
  return {
    elimination: { label: 'Strong', sampleSize: 22 },
    strategicSkipping: { label: 'Developing', sampleSize: 14 },
    timeAllocation: { label: 'Needs attention', sampleSize: 18 },
    currentFocus: 'Know when to move on',
  };
}

export default function DecisionDashboardPanel({ profile = defaultProfile(), onTrain }: Partial<DecisionDashboardPanelProps>) {
  const rows = DIMENSION_LABELS.filter(({ key }) => profile[key] != null);

  return (
    <div className="f58-root f58-dash">
      <div className="f58-dash__header">
        <h3 className="f58-title f58-dash__title">Decision intelligence</h3>
      </div>

      {rows.length === 0 ? (
        <p className="f58-dash__empty">Not enough uncertain-question decisions recorded yet to show a profile.</p>
      ) : (
        <ul className="f58-dash__list">
          {rows.map(({ key, label }) => {
            const dimension = profile[key];
            if (!dimension) return null;
            return (
              <li key={key} className="f58-dash__row">
                <span className="f58-dash__row-label">{label}</span>
                <span className={`f58-dash__row-value f58-dash__row-value--${dimension.label.replace(/\s+/g, '-').toLowerCase()}`}>
                  {dimension.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {profile.currentFocus && (
        <p className="f58-dash__focus">
          Current focus: <strong>{profile.currentFocus}</strong>
        </p>
      )}

      <button type="button" className="f58-btn f58-btn--primary f58-dash__train" onClick={onTrain}>
        Train
      </button>
    </div>
  );
}
