import { useEffect, useState } from 'react';
import { api, ApiError, getStudentId, setStudentId } from '../api/client';
import type { AssessmentHistoryEntry, AssessmentType } from '../api/types';
import { colorForScore } from '../components/spectrum';

const ASSESSMENT_TYPES: { type: AssessmentType; label: string; purpose: string; meta: string }[] = [
  { type: 'DIAGNOSTIC_ASSESSMENT', label: 'Diagnostic Assessment', purpose: 'A broad baseline across every domain - the right starting point with little or no history yet.', meta: '20 questions · 25 min' },
  { type: 'MIXED_APTITUDE_ASSESSMENT', label: 'Mixed Aptitude Assessment', purpose: 'A realistic, general mixed-topic exam resembling an actual placement test.', meta: '30 questions · 35 min' },
  { type: 'TIMED_ASSESSMENT', label: 'Timed Assessment', purpose: 'A deliberately tight time budget to stress-test pacing and time management.', meta: '20 questions · ~17 min' },
  { type: 'PROGRESS_ASSESSMENT', label: 'Progress Assessment', purpose: 'A short check on recently-practiced weak skills, with light coverage of the rest.', meta: '12 questions · 15 min' },
  { type: 'MASTERY_ASSESSMENT', label: 'Mastery Assessment', purpose: 'Deep, harder-skewed verification of one or two specific topics.', meta: '15 questions · 20 min' },
  { type: 'READINESS_ASSESSMENT', label: 'Readiness Assessment', purpose: 'Broad and moderately hard - built to produce strong readiness evidence.', meta: '25 questions · 30 min' },
  { type: 'FULL_MOCK_ASSESSMENT', label: 'Full Mock Assessment', purpose: 'The longest, full-length simulation of an actual aptitude placement test.', meta: '50 questions · 60 min' },
  { type: 'FINAL_READINESS_CHECK', label: 'Final Readiness Check', purpose: 'The last checkpoint before the real exam - requires prior assessments on record.', meta: '30 questions · 40 min' },
];

export function Home({
  onStart,
  onViewHistory,
  onViewResult,
}: {
  onStart: (assessmentId: string) => void;
  onViewHistory: () => void;
  onViewResult: (assessmentId: string) => void;
}) {
  const [selected, setSelected] = useState<AssessmentType>('DIAGNOSTIC_ASSESSMENT');
  const [studentIdInput, setStudentIdInput] = useState(getStudentId());
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssessmentHistoryEntry[] | null>(null);

  useEffect(() => {
    api.getHistory().then((r) => setHistory(r.history)).catch(() => setHistory([]));
  }, [studentIdInput]);

  const latestCompleted = [...(history ?? [])].reverse().find((h) => h.overallScore !== null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { assessment } = await api.createAssessment(selected);
      onStart(assessment.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create that assessment.');
      setStarting(false);
    }
  };

  const applyStudentId = () => {
    setStudentId(studentIdInput.trim());
    setStudentIdInput(getStudentId());
  };

  return (
    <div className="container stack-lg" style={{ paddingTop: 'var(--space-7)', paddingBottom: 'var(--space-8)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">ACEAPT · Feature 6</span>
          <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 6 }}>Readiness Engine</h1>
          <p style={{ color: 'var(--bone-text-muted)', marginTop: 6, maxWidth: 460 }}>
            Not another mock-test page. A realistic exam simulation that measures whether you're actually ready - and exactly what to fix next.
          </p>
        </div>
        <div className="card" style={{ minWidth: 240 }}>
          <span className="eyebrow">Student</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyStudentId()}
              style={{
                flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--bone-line)', background: 'var(--bone)', color: 'var(--bone-text)', fontSize: 'var(--text-sm)',
              }}
            />
            <button className="btn btn-secondary" onClick={applyStudentId} style={{ padding: '8px 14px' }}>Set</button>
          </div>
        </div>
      </header>

      {latestCompleted && (
        <button
          onClick={() => onViewResult(latestCompleted.assessmentId)}
          className="card"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', width: '100%', border: '1px solid var(--bone-line)' }}
        >
          <div>
            <span className="eyebrow">Most recent readiness</span>
            <p style={{ marginTop: 4, fontSize: 'var(--text-sm)', color: 'var(--bone-text-muted)' }}>
              From your last completed assessment - tap to view the full report.
            </p>
          </div>
          <span
            className="data-num"
            style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, color: colorForScore(latestCompleted.overallScore ?? 0) }}
          >
            {latestCompleted.overallScore}%
          </span>
        </button>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>Start an assessment</h2>
          <button className="btn btn-ghost" onClick={onViewHistory} style={{ padding: 0 }}>View history →</button>
        </div>

        <div className="stack-sm" style={{ marginTop: 'var(--space-4)' }}>
          {ASSESSMENT_TYPES.map((t) => {
            const isSelected = t.type === selected;
            return (
              <button
                key={t.type}
                className="card"
                onClick={() => setSelected(t.type)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  border: `1px solid ${isSelected ? 'var(--bone-text)' : 'var(--bone-line)'}`,
                }}
              >
                <div>
                  <p style={{ fontWeight: 600 }}>{t.label}</p>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--bone-text-muted)', marginTop: 4 }}>{t.purpose}</p>
                </div>
                <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>{t.meta}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <p style={{ color: '#c8493c' }}>{error}</p>}

      <button className="btn btn-primary" onClick={start} disabled={starting} style={{ alignSelf: 'flex-start', padding: '14px 28px' }}>
        {starting ? 'Preparing…' : 'Start assessment'}
      </button>
    </div>
  );
}
