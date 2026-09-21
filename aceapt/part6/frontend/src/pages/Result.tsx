import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AssessmentResult } from '../api/types';
import { ReadinessGauge } from '../components/ReadinessGauge';
import { DimensionBar } from '../components/DimensionBar';
import { colorForScore } from '../components/spectrum';

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="data-num" style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{value}</div>
      <div className="eyebrow" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <span className="eyebrow">{title}</span>
      <ul style={{ margin: '8px 0 0', paddingLeft: 20 }} className="stack-sm">
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 'var(--text-base)', lineHeight: 1.55 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function Result({
  assessmentId,
  onBackToStart,
  onViewHistory,
}: {
  assessmentId: string;
  onBackToStart: () => void;
  onViewHistory: () => void;
}) {
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [practiceState, setPracticeState] = useState<'idle' | 'simulating' | 'done'>('idle');
  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getResult(assessmentId)
      .then((r) => setResult(r.result))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this result.'));
    api.getRecommendation().then((r) => setPracticeSessionId(r.practiceSession?.id ?? null)).catch(() => {});
  }, [assessmentId]);

  const simulatePractice = async () => {
    if (!practiceSessionId) return;
    setPracticeState('simulating');
    try {
      await api.completePractice(practiceSessionId, 85, 10);
      setPracticeState('done');
    } catch {
      setPracticeState('idle');
    }
  };

  if (error) {
    return (
      <div className="container center-column" style={{ paddingTop: 'var(--space-8)' }}>
        <p style={{ color: '#c8493c', marginBottom: 'var(--space-4)' }}>{error}</p>
        <button className="btn btn-secondary" onClick={onBackToStart}>Back to start</button>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="container center-column" style={{ paddingTop: 'var(--space-8)' }}>
        <p className="eyebrow">Scoring your assessment…</p>
      </div>
    );
  }

  const { readiness, diagnosis } = result;

  return (
    <div className="container stack-lg" style={{ paddingTop: 'var(--space-7)', paddingBottom: 'var(--space-8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="eyebrow">Assessment Report</span>
        <button className="btn btn-ghost" onClick={onViewHistory} style={{ padding: 0 }}>History →</button>
      </div>

      <div className="card">
        <ReadinessGauge score={readiness.overallScore} state={readiness.state} confidence={readiness.confidence} />
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--bone-text-muted)', fontSize: 'var(--text-sm)' }}>
          {readiness.confidenceReason}
        </p>
      </div>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
        <StatChip label="Accuracy" value={`${result.accuracyPct}%`} />
        <StatChip label="Score" value={`${result.rawScore}/${result.maxScore}`} />
        <StatChip label="Correct" value={result.correctCount} />
        <StatChip label="Incorrect" value={result.incorrectCount} />
        <StatChip label="Unanswered" value={result.unansweredCount} />
      </div>

      <div className="card stack">
        <span className="eyebrow">Readiness by dimension</span>
        <div className="stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-5)', marginTop: 0 }}>
          {readiness.dimensions.map((d) => (
            <DimensionBar key={d.dimension} dim={d} />
          ))}
        </div>
      </div>

      {readiness.sectionReadiness.length > 0 && (
        <div className="card" style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          {readiness.sectionReadiness.map((s) => (
            <div key={s.domain}>
              <span className="eyebrow">{s.domain}</span>
              <div className="data-num" style={{ fontSize: 'var(--text-xl)', color: colorForScore(s.score), marginTop: 4 }}>
                {s.score}%
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack">
        <ListSection title="What went well" items={diagnosis.whatWentWell} />
        <ListSection title="What reduced performance" items={diagnosis.whatWentWrong} />
        <ListSection title="Why" items={diagnosis.why} />
      </div>

      <div className="card stack" style={{ borderColor: '#c8493c55' }}>
        <div>
          <span className="eyebrow">Biggest risk</span>
          <p style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)', fontWeight: 600, marginTop: 4 }}>
            {diagnosis.biggestRisk}
          </p>
        </div>
        <div>
          <span className="eyebrow">Fix first</span>
          <p style={{ marginTop: 4 }}>{diagnosis.whatToFixFirst}</p>
        </div>
      </div>

      <div className="card stack" style={{ background: 'var(--bone-text)', color: 'var(--bone)' }}>
        <span className="eyebrow" style={{ color: 'rgba(245,242,234,0.7)' }}>Next best action</span>
        <p style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {diagnosis.whatToPracticeNext}
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'rgba(245,242,234,0.75)' }}>{diagnosis.whenToReassess}</p>

        {practiceSessionId && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <button
              className="btn"
              onClick={simulatePractice}
              disabled={practiceState !== 'idle'}
              style={{ background: 'var(--bone)', color: 'var(--bone-text)' }}
            >
              {practiceState === 'done'
                ? '✓ Practice marked complete (demo)'
                : practiceState === 'simulating'
                  ? 'Marking complete…'
                  : 'Demo: simulate completing this practice'}
            </button>
            {practiceState === 'done' && (
              <p style={{ fontSize: 'var(--text-xs)', marginTop: 8, color: 'rgba(245,242,234,0.7)' }}>
                In the real product, Feature 5 reports this automatically once you finish practicing.
                Take another assessment now to see readiness reassessed against this progress.
              </p>
            )}
          </div>
        )}
      </div>

      {result.practiceVsAssessmentGap.available && (
        <div className="card">
          <span className="eyebrow">Practice vs. assessment gap</span>
          <p style={{ marginTop: 6 }}>{result.practiceVsAssessmentGap.note}</p>
        </div>
      )}

      {(result.answerChangeInsight.insightText || result.skipStrategyInsight.insightText) && (
        <div className="card stack-sm">
          <span className="eyebrow">Strategy notes</span>
          {result.answerChangeInsight.insightText && <p>{result.answerChangeInsight.insightText}</p>}
          <p>{result.skipStrategyInsight.insightText}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button className="btn btn-primary" onClick={onBackToStart}>Start another assessment</button>
        <button className="btn btn-secondary" onClick={onViewHistory}>View history</button>
      </div>
    </div>
  );
}
