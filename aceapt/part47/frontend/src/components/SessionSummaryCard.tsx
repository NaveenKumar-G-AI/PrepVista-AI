import type { StudentFeedback, SummaryView } from '../api/types.js';
import './SessionSummaryCard.css';

const FEEDBACK_OPTIONS: { value: StudentFeedback; label: string }[] = [
  { value: 'VERY_HELPFUL', label: 'Very helpful' },
  { value: 'HELPFUL', label: 'Helpful' },
  { value: 'TOO_MUCH_GUIDANCE', label: 'Too much guidance' },
  { value: 'NOT_ENOUGH_GUIDANCE', label: 'Not enough guidance' },
  { value: 'WANTED_DIRECT_EXPLANATION', label: 'I wanted a direct explanation' },
];

export function SessionSummaryCard({
  summary,
  canVerify,
  onStartVerification,
  onNewProblem,
  onFeedback,
  loading,
}: {
  summary: SummaryView;
  canVerify: boolean;
  onStartVerification: () => void;
  onNewProblem: () => void;
  onFeedback: (feedback: StudentFeedback) => void;
  loading: boolean;
}) {
  const { outcome } = summary;

  return (
    <section className="session-summary">
      <h2>Session summary</h2>

      <div className="session-summary__stats">
        <Stat label="Steps solved independently" value={`${outcome.stepsIndependent} / ${outcome.stepsTotal}`} />
        <Stat label="Hints used" value={String(outcome.hintsUsed)} />
        <Stat label="Retries" value={String(outcome.retries)} />
        {outcome.recoverySuccess && <Stat label="Recovery" value="Recovered after guidance" />}
        {outcome.solutionRequested && <Stat label="Solution" value={outcome.reconstructionSuccess ? 'Revealed, reconstructed' : 'Revealed'} />}
        {outcome.verificationSuccess !== null && (
          <Stat label="Independent verification" value={outcome.verificationSuccess ? 'Passed' : 'Not yet'} />
        )}
      </div>

      <p className="session-summary__dependency">{summary.guidanceDependencyMessage}</p>

      {canVerify && outcome.verificationSuccess === null && (
        <div className="session-summary__cta">
          <p>Ready to see if you can do this without any help?</p>
          <button type="button" className="answer-input__submit" onClick={onStartVerification} disabled={loading}>
            Try a new problem, independently
          </button>
        </div>
      )}

      {outcome.verificationSuccess !== null && (
        <div className="session-summary__cta">
          <button type="button" className="answer-input__submit" onClick={onNewProblem} disabled={loading}>
            Pick another problem
          </button>
        </div>
      )}

      {!outcome.studentFeedback && (
        <div className="session-summary__feedback">
          <p>Did guided solving help?</p>
          <div className="session-summary__feedback-options">
            {FEEDBACK_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" className="help-button" disabled={loading} onClick={() => onFeedback(opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="session-summary__stat">
      <span className="session-summary__stat-value">{value}</span>
      <span className="session-summary__stat-label">{label}</span>
    </div>
  );
}
