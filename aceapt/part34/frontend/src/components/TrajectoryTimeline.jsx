import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { LoadingBlock, ErrorBlock } from './Shared.jsx';

function relativeDay(iso) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function describeEvent(e) {
  if (e.kind === 'evidence') {
    return (
      <>
        <strong>{e.label}</strong> — {e.type} recorded, scored <span className="mono">{e.score}</span>
      </>
    );
  }
  switch (e.type) {
    case 'target_selected':
      return 'Target selected';
    case 'target_changed':
      return 'Target changed';
    case 'intervention_started':
      return (
        <>
          Started: <strong>{e.payload?.title ?? 'intervention'}</strong>
        </>
      );
    case 'intervention_completed':
      return (
        <>
          Completed intervention — result <span className="mono">{e.payload?.resultScore}</span>
        </>
      );
    default:
      return e.type;
  }
}

export default function TrajectoryTimeline() {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .getTimeline()
      .then((d) => setEvents(d.events))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingBlock label="Loading trajectory history…" />;
  if (error) return <ErrorBlock message={error} onRetry={load} />;
  if (!events || events.length === 0) return <p className="muted">No historical evidence yet.</p>;

  const ordered = [...events].reverse();

  return (
    <div className="screen">
      <ol className="timeline" aria-label="Career trajectory history, most recent first">
        {ordered.map((e, i) => (
          <li key={i} className={`timeline__item timeline__item--${e.kind}`}>
            <span className="timeline__when mono">{relativeDay(e.occurredAt)}</span>
            <span className="timeline__what">{describeEvent(e)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
