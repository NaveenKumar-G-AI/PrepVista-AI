import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { LoadingBlock, ErrorBlock, InsufficientEvidenceBlock } from './Shared.jsx';

export default function ScenarioExplorer() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [altTarget, setAltTarget] = useState('');

  const load = (target) => {
    setLoading(true);
    setError('');
    api
      .getScenarios(target)
      .then((d) => {
        setData(d);
        if (!target && d.availableTargets?.[0]) setAltTarget(d.availableTargets[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingBlock label="Working out planning scenarios…" />;
  if (error) return <ErrorBlock message={error} onRetry={() => load(altTarget)} />;
  if (data?.insufficientEvidence) {
    return (
      <InsufficientEvidenceBlock
        title="Scenarios aren't available yet"
        body="Scenario planning needs a baseline trajectory first — complete some evidence on the Career Movement tab."
      />
    );
  }
  if (!data) return null;

  return (
    <div className="screen">
      <p className="disclaimer">{data.disclaimer}</p>
      <div className="scenario-grid">
        {data.scenarios.map((s) => (
          <article key={s.id} className="scenario-card">
            <h3>{s.title}</h3>
            <p>{s.summary}</p>
            {s.alignment && (
              <p className="muted">
                <strong>Alignment:</strong> {s.alignment}
              </p>
            )}
            {s.reusedCapabilities?.length > 0 && (
              <p className="muted">
                <strong>Existing capability reuse:</strong> {s.reusedCapabilities.join(', ')}
              </p>
            )}
            {s.newCapabilities?.length > 0 && (
              <p className="muted">
                <strong>Would need to build:</strong> {s.newCapabilities.join(', ')}
              </p>
            )}
            {s.basis && <p className="scenario-card__basis">{s.basis}</p>}
          </article>
        ))}
      </div>

      {data.availableTargets?.length > 0 && (
        <div className="panel">
          <h2>Compare against a different target</h2>
          <div className="target-picker">
            <select value={altTarget} onChange={(e) => setAltTarget(e.target.value)} aria-label="Target to compare against">
              {data.availableTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button className="btn btn--secondary" onClick={() => load(altTarget)}>
              Compare
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
