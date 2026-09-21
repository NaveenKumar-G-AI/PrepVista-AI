import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AssessmentHistoryEntry } from '../api/types';
import { colorForScore } from '../components/spectrum';

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 280;
  const h = 56;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  return (
    <svg width={w} height={h} role="img" aria-label="Readiness trend over time">
      <polyline points={points.join(' ')} fill="none" stroke={colorForScore(last)} strokeWidth={2} />
      {points.map((p, i) => {
        const [x, y] = p.split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3.5 : 2.5} fill={colorForScore(values[i])} />;
      })}
    </svg>
  );
}

const TYPE_LABEL: Record<string, string> = {
  DIAGNOSTIC_ASSESSMENT: 'Diagnostic',
  PROGRESS_ASSESSMENT: 'Progress',
  MASTERY_ASSESSMENT: 'Mastery',
  MIXED_APTITUDE_ASSESSMENT: 'Mixed Aptitude',
  TIMED_ASSESSMENT: 'Timed',
  FULL_MOCK_ASSESSMENT: 'Full Mock',
  READINESS_ASSESSMENT: 'Readiness',
  FINAL_READINESS_CHECK: 'Final Readiness Check',
};

export function History({ onBack, onOpen }: { onBack: () => void; onOpen: (assessmentId: string) => void }) {
  const [entries, setEntries] = useState<AssessmentHistoryEntry[] | null>(null);

  useEffect(() => {
    api.getHistory().then((r) => setEntries(r.history));
  }, []);

  const scored = (entries ?? []).filter((e) => e.overallScore !== null);

  return (
    <div className="container stack-lg" style={{ paddingTop: 'var(--space-7)', paddingBottom: 'var(--space-8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span className="eyebrow">Assessment History</span>
          <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 6 }}>Your progress over time</h1>
        </div>
        <button className="btn btn-ghost" onClick={onBack} style={{ padding: 0 }}>← Start</button>
      </div>

      {scored.length >= 2 && (
        <div className="card">
          <span className="eyebrow">Readiness trend</span>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Sparkline values={scored.map((e) => e.overallScore as number)} />
          </div>
        </div>
      )}

      {entries === null && <p className="eyebrow">Loading…</p>}
      {entries !== null && entries.length === 0 && (
        <p style={{ color: 'var(--bone-text-muted)' }}>No assessments yet - start one from the home screen.</p>
      )}

      <div className="stack-sm">
        {(entries ?? [])
          .slice()
          .reverse()
          .map((e) => (
            <button
              key={e.assessmentId}
              className="card"
              onClick={() => e.overallScore !== null && onOpen(e.assessmentId)}
              disabled={e.overallScore === null}
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <p style={{ fontWeight: 600 }}>{TYPE_LABEL[e.type] ?? e.type}</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--bone-text-muted)', marginTop: 2 }}>
                  {new Date(e.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {e.status.replace('_', ' ').toLowerCase()}
                </p>
              </div>
              {e.overallScore !== null ? (
                <span className="data-num" style={{ fontSize: 'var(--text-xl)', color: colorForScore(e.overallScore) }}>
                  {e.overallScore}%
                </span>
              ) : (
                <span className="eyebrow">{e.status.replace('_', ' ').toLowerCase()}</span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
