import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { StudentSwitcher } from './components/StudentSwitcher';
import { NextInterventionCard } from './components/NextInterventionCard';
import { InterventionRunner } from './components/InterventionRunner';
import { AfterInterventionSummary } from './components/AfterInterventionSummary';
import { InterventionHistoryList } from './components/InterventionHistoryList';
import { ProfilePanel } from './components/ProfilePanel';
import { InterventionDecision, InterventionExecution, CompleteResponse, HistoryItem, InterventionProfile } from './types';

type View = 'loading' | 'decision' | 'none' | 'running' | 'summary' | 'error';

export default function App() {
  const [studentId, setStudentId] = useState('student_102');
  const [view, setView] = useState<View>('loading');
  const [error, setError] = useState<string | null>(null);

  const [decision, setDecision] = useState<InterventionDecision | null>(null);
  const [explanation, setExplanation] = useState('');
  const [coldStart, setColdStart] = useState(false);
  const [starting, setStarting] = useState(false);

  const [execution, setExecution] = useState<InterventionExecution | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completeResult, setCompleteResult] = useState<CompleteResponse | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [profile, setProfile] = useState<InterventionProfile | null>(null);

  const loadSideData = useCallback(async (id: string) => {
    const [h, p] = await Promise.all([api.getHistory(id), api.getProfile(id)]);
    setHistory(h.history);
    setProfile(p.profile);
  }, []);

  const loadNext = useCallback(async (id: string) => {
    setView('loading');
    setError(null);
    try {
      const res = await api.getNextIntervention(id);
      if (res.decision) {
        setDecision(res.decision);
        setExplanation(res.explanation ?? '');
        setColdStart(!!res.coldStart);
        setView('decision');
      } else {
        setDecision(null);
        setView('none');
      }
      await loadSideData(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setView('error');
    }
  }, [loadSideData]);

  useEffect(() => {
    loadNext(studentId);
  }, [studentId, loadNext]);

  async function handleStart() {
    if (!decision) return;
    setStarting(true);
    try {
      const res = await api.startIntervention(studentId, decision.id);
      setExecution(res.execution);
      setView('running');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start intervention');
    } finally {
      setStarting(false);
    }
  }

  async function handleComplete(result: { accuracyPct: number; questionsCompleted: number }) {
    if (!execution) return;
    setSubmitting(true);
    try {
      const res = await api.completeIntervention(studentId, execution.id, result);
      setCompleteResult(res);
      setView('summary');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit result');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinue() {
    setExecution(null);
    setCompleteResult(null);
    await loadNext(studentId);
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <div className="font-display text-lg font-semibold text-ink">ACEAPT</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Feature 12 · Intervention Engine</div>
        </div>
        <StudentSwitcher studentId={studentId} onChange={setStudentId} />
      </header>

      <main className="space-y-8">
        {view === 'loading' && <p className="text-sm text-muted">Loading…</p>}

        {view === 'error' && (
          <div className="rounded-2xl border border-risk/30 bg-riskSoft p-5 text-sm text-risk">{error}</div>
        )}

        {view === 'none' && (
          <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted shadow-panel">
            No intervention-worthy problem detected from current evidence for this student.
          </div>
        )}

        {view === 'decision' && decision && (
          <NextInterventionCard decision={decision} explanation={explanation} coldStart={coldStart} onStart={handleStart} starting={starting} />
        )}

        {view === 'running' && execution && (
          <InterventionRunner execution={execution} onComplete={handleComplete} submitting={submitting} />
        )}

        {view === 'summary' && completeResult && (
          <AfterInterventionSummary studentId={studentId} result={completeResult} onContinue={handleContinue} />
        )}

        <section>
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">Response profile</h3>
          <ProfilePanel profile={profile} />
        </section>

        <section>
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">Recent interventions</h3>
          <InterventionHistoryList history={history} />
        </section>
      </main>
    </div>
  );
}
