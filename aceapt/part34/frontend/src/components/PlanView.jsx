import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { LoadingBlock, ErrorBlock, InsufficientEvidenceBlock } from './Shared.jsx';

const COLUMNS = [
  { key: 'day30', label: '30 days' },
  { key: 'day60', label: '60 days' },
  { key: 'day90', label: '90 days' },
];

export default function PlanView() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .getPlan()
      .then((d) => setPlan(d.insufficientEvidence ? null : d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingBlock label="Building your plan…" />;
  if (error) return <ErrorBlock message={error} onRetry={load} />;
  if (!plan) {
    return <InsufficientEvidenceBlock title="A plan isn't available yet" body="30/60/90 day planning needs a baseline trajectory first." />;
  }

  return (
    <div className="screen">
      <div className="plan-progression" aria-hidden="true">
        {COLUMNS.map((col) => (
          <div key={col.key} className="plan-progression__tick">
            <span className="plan-progression__dot" />
            <span className="mono">{col.label}</span>
          </div>
        ))}
      </div>
      <div className="plan-grid">
        {COLUMNS.map((col) => (
          <div key={col.key} className="plan-column">
            <h2>{col.label}</h2>
            <ol className="plan-list">
              {plan[col.key].map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
