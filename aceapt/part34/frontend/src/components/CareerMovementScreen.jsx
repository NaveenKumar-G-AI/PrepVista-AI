import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { TrajectoryBadge, Pill, LoadingBlock, ErrorBlock, toTitleCase } from './Shared.jsx';

export default function CareerMovementScreen({ onStateChanged }) {
  const [state, setState] = useState(null);
  const [limitingFactor, setLimitingFactor] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [inProgress, setInProgress] = useState(null);
  const [plan, setPlan] = useState(null);
  const [narrative, setNarrative] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resultScore, setResultScore] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.allSettled([api.getState(), api.getLimitingFactor(), api.getRecommendation(), api.getPlan()]).then((results) => {
      const [s, lf, rec, p] = results;
      let firstError = '';
      if (s.status === 'fulfilled') setState(s.value);
      else firstError = s.reason.message;
      if (lf.status === 'fulfilled') setLimitingFactor(lf.value.limitingFactor);
      if (rec.status === 'fulfilled') {
        setRecommendation(rec.value.recommendation);
        setInProgress(rec.value.inProgress);
      }
      if (p.status === 'fulfilled') setPlan(p.value.insufficientEvidence ? null : p.value);
      setError(firstError);
      setLoading(false);
    });

    // Best-effort AI narrative - never blocks the screen if it's unavailable.
    api
      .getExplanation('trajectory')
      .then((r) => setNarrative(r.text))
      .catch(() => setNarrative(''));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    setSubmitting(true);
    setError('');
    try {
      const { intervention } = await api.startIntervention();
      setInProgress(intervention);
      setRecommendation(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(e) {
    e.preventDefault();
    const score = Number(resultScore);
    if (Number.isNaN(score) || score < 0 || score > 100) return;
    setSubmitting(true);
    setError('');
    try {
      await api.completeIntervention(inProgress.id, score);
      setResultScore('');
      setInProgress(null);
      load();
      onStateChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !state) return <LoadingBlock label="Loading your career movement…" />;
  if (error && !state) return <ErrorBlock message={error} onRetry={load} />;
  if (!state) return null;

  return (
    <div className="screen">
      <section className="hero-card">
        <div className="hero-card__row">
          <div className="hero-card__cell">
            <div className="eyebrow">Current state</div>
            <div className="hero-card__value">{toTitleCase(state.currentState)}</div>
          </div>
          <div className="hero-card__cell">
            <div className="eyebrow">Trajectory</div>
            <TrajectoryBadge trajectory={state.trajectory} confidence={state.trajectoryConfidence} />
          </div>
          <div className="hero-card__cell">
            <div className="eyebrow">Momentum</div>
            <div className="hero-card__value">{toTitleCase(state.momentum)}</div>
          </div>
          <div className="hero-card__cell">
            <div className="eyebrow">Readiness distance</div>
            <div className="hero-card__value">{toTitleCase(state.readinessDistance)}</div>
          </div>
        </div>
        {narrative && <p className="hero-card__narrative">{narrative}</p>}
        {state.trajectoryExcluded?.length > 0 && (
          <p className="hero-card__note">
            {state.trajectoryExcluded.join(', ')} {state.trajectoryExcluded.length === 1 ? "doesn't" : "don't"} have enough evidence
            yet, so {state.trajectoryExcluded.length === 1 ? 'it was' : 'they were'} left out of this trajectory read.
          </p>
        )}
      </section>

      {state.activityProgressMismatches?.length > 0 && (
        <section className="callout callout--caution">
          {state.activityProgressMismatches.map((m) => (
            <p key={m.capability}>{m.message}</p>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>What changed</h2>
        {state.whatChanged.length === 0 ? (
          <p className="muted">No recent evidence yet.</p>
        ) : (
          <ul className="change-list">
            {state.whatChanged.map((c, i) => (
              <li key={i} className={c.delta > 0 ? 'is-up' : c.delta < 0 ? 'is-down' : ''}>
                <span aria-hidden="true" className="change-list__icon">
                  {c.delta > 0 ? '✓' : c.delta < 0 ? '⚠' : '•'}
                </span>
                <span>
                  <strong>{c.label}</strong> — {c.type} scored <span className="mono">{c.score}</span>
                  {typeof c.delta === 'number' && c.delta !== 0 && (
                    <span className="change-list__delta mono">
                      {' '}
                      ({c.delta > 0 ? '+' : ''}
                      {c.delta})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>What's limiting you</h2>
        {limitingFactor ? (
          <div>
            <Pill tone={limitingFactor.type === 'evidence_gap' ? 'neutral' : 'caution'}>
              {limitingFactor.type === 'evidence_gap' ? 'Evidence gap' : 'Capability gap'}
            </Pill>
            <p className="panel__lead">{limitingFactor.label}</p>
            <p className="muted">{limitingFactor.reason}</p>
          </div>
        ) : (
          <p className="muted">No single capability is clearly limiting this target right now.</p>
        )}
      </section>

      <section className="panel panel--action">
        <h2>Next best action</h2>
        {inProgress ? (
          <form onSubmit={handleComplete} className="action-form">
            <p className="panel__lead">{inProgress.payload.title}</p>
            <p className="muted">In progress. Log your result to update your trajectory.</p>
            <label htmlFor="resultScore">Result score (0–100)</label>
            <input
              id="resultScore"
              type="number"
              min="0"
              max="100"
              value={resultScore}
              onChange={(e) => setResultScore(e.target.value)}
              required
            />
            <button className="btn btn--primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Log result'}
            </button>
          </form>
        ) : recommendation ? (
          <div>
            <p className="panel__lead">{recommendation.title}</p>
            <p className="muted">{recommendation.reason}</p>
            <button className="btn btn--primary" onClick={handleStart} disabled={submitting}>
              {submitting ? 'Starting…' : 'Start'}
            </button>
          </div>
        ) : (
          <p className="muted">No specific action is currently recommended.</p>
        )}
      </section>

      {plan && (
        <section className="panel">
          <h2>Next 30 days</h2>
          <ol className="plan-list">
            {plan.day30.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>
      )}

      {error && state && <ErrorBlock message={error} onRetry={load} />}
    </div>
  );
}
