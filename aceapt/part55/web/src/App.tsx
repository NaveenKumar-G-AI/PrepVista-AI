import { useEffect, useState } from 'react';
import { api, type AdminSnapshot, type Anomaly, type CalibrationCenterSummary, type HistoryEntry } from './lib/api.js';
import { CalibrationCenterDashboard } from './components/CalibrationCenterDashboard.js';
import { QuestionDifficultyDetail } from './components/QuestionDifficultyDetail.js';
import { AnomalyReviewQueue } from './components/AnomalyReviewQueue.js';
import { DifficultyBadge } from './components/DifficultyBadge.js';
import { PersonalChallengeBadge } from './components/PersonalChallengeBadge.js';
import {
  mockAdminSnapshot,
  mockAnomalies,
  mockHistory,
  mockStudentAtLevel,
  mockStudentEasy,
  mockStudentStretch,
  mockSummary,
} from './mock/data.js';

// This shell exists to preview every Feature 55 component together — the
// real ACEAPT admin app and student app each mount these components
// individually, wherever question difficulty needs to show up (a question
// card, an admin question editor, the calibration center page, etc).
// VITE_DEMO_TOKEN / VITE_API_BASE let it hit the real running API; with
// neither set it falls back to the mock data in src/mock/data.ts so
// `npm run dev` shows something immediately.

const DEMO_TOKEN = import.meta.env.VITE_DEMO_TOKEN as string | undefined;
const USE_LIVE_API = Boolean(DEMO_TOKEN);

export default function App() {
  const [summary, setSummary] = useState<CalibrationCenterSummary>(mockSummary);
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(mockAdminSnapshot);
  const [history, setHistory] = useState<HistoryEntry[]>(mockHistory);
  const [anomalies, setAnomalies] = useState<Anomaly[]>(mockAnomalies);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!USE_LIVE_API || !DEMO_TOKEN) return;
    (async () => {
      try {
        const [s, a] = await Promise.all([api.getSummary(DEMO_TOKEN), api.getAnomalies(DEMO_TOKEN)]);
        setSummary(s);
        setAnomalies(a.anomalies);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function handleReview(anomalyId: string, questionVersionId: string, action: string) {
    if (!USE_LIVE_API || !DEMO_TOKEN) {
      // demo mode: just remove it from the local list
      setAnomalies((prev) => prev.filter((a) => a.id !== anomalyId));
      return;
    }
    await api.submitReview(DEMO_TOKEN, { questionVersionId, anomalyId, action });
    const refreshed = await api.getAnomalies(DEMO_TOKEN);
    setAnomalies(refreshed.anomalies);
  }

  async function handleRecalibrate() {
    if (!USE_LIVE_API || !DEMO_TOKEN) return;
    await api.recalibrate(DEMO_TOKEN, snapshot.question_version_id);
    const [s, h] = await Promise.all([
      api.getAdminDifficulty(DEMO_TOKEN, snapshot.question_version_id),
      api.getHistory(DEMO_TOKEN, snapshot.question_version_id),
    ]);
    setSnapshot(s);
    setHistory(h.history);
  }

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="border-b border-grid bg-panel">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="font-mono text-[11px] uppercase tracking-wide text-brass">ACEAPT · Feature 55</div>
          <h1 className="font-display text-2xl text-ink">Question Difficulty Calibration Engine</h1>
          {!USE_LIVE_API && (
            <p className="mt-1 text-xs text-ink-soft">
              Showing sample data — set VITE_API_BASE and VITE_DEMO_TOKEN to preview against a running backend.
            </p>
          )}
          {error && <p className="mt-1 text-xs text-rust">{error}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
        <section>
          <CalibrationCenterDashboard summary={summary} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-ink-soft">Student view</h2>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <DifficultyBadge data={mockStudentEasy} />
              <PersonalChallengeBadge data={mockStudentEasy} />
            </div>
            <div className="space-y-2">
              <DifficultyBadge data={mockStudentAtLevel} />
              <PersonalChallengeBadge data={mockStudentAtLevel} />
            </div>
            <div className="space-y-2">
              <DifficultyBadge data={mockStudentStretch} />
              <PersonalChallengeBadge data={mockStudentStretch} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-ink-soft">Question detail</h2>
          <QuestionDifficultyDetail snapshot={snapshot} history={history} onRecalibrate={handleRecalibrate} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-ink-soft">Review queue</h2>
          <AnomalyReviewQueue anomalies={anomalies} onReview={handleReview} />
        </section>
      </main>
    </div>
  );
}
