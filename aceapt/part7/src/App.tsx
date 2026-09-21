import { useEffect, useState } from 'react';
import { Activity, Target, Flag, TrendingUp, LayoutGrid } from 'lucide-react';
import { api } from './api/client';
import type { StudentSummary } from './types';
import ActionCenter from './components/ActionCenter';
import PriorityBoard from './components/PriorityBoard';
import ReadinessGapPanel from './components/ReadinessGapPanel';
import MilestonesPanel from './components/MilestonesPanel';
import ProgressStoryPanel from './components/ProgressStoryPanel';

type Tab = 'action' | 'priorities' | 'gap' | 'milestones' | 'progress';

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'action', label: 'Action Center', icon: Activity },
  { id: 'priorities', label: 'Priorities', icon: LayoutGrid },
  { id: 'gap', label: 'Readiness Gap', icon: Target },
  { id: 'milestones', label: 'Milestones', icon: Flag },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('action');
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    api
      .summary()
      .then((s) => {
        setSummary(s);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [refreshKey]);

  return (
    <div className="min-h-screen bg-ink text-ivory">
      <header className="border-b border-line">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase">ACEAPT · Feature 07</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Action Center</h1>
            {summary?.goal && (
              <p className="text-sm text-slate mt-1">
                Target <span className="font-mono text-ivory">{summary.goal.target}%</span> readiness
              </p>
            )}
          </div>
          <ReadinessGauge value={summary?.readiness ?? 0} target={summary?.goal?.target ?? 80} />
        </div>
        <nav className="mx-auto max-w-5xl px-6 flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === id ? 'border-amber text-ivory' : 'border-transparent text-slate hover:text-ivory'
              }`}
            >
              <Icon size={15} strokeWidth={2} />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
            Couldn't reach the Feature 7 API. Is the backend running on the URL in{' '}
            <code className="font-mono">VITE_API_BASE_URL</code>? ({error})
          </div>
        )}
        {tab === 'action' && <ActionCenter onChanged={refresh} />}
        {tab === 'priorities' && <PriorityBoard key={refreshKey} />}
        {tab === 'gap' && <ReadinessGapPanel key={refreshKey} />}
        {tab === 'milestones' && <MilestonesPanel key={refreshKey} />}
        {tab === 'progress' && <ProgressStoryPanel key={refreshKey} />}
      </main>
    </div>
  );
}

function ReadinessGauge({ value, target }: { value: number; target: number }) {
  const size = 88;
  const stroke = 7;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value / 100));
  const targetPct = Math.min(1, Math.max(0, target / 100));

  // 0% = 12 o'clock, sweeping clockwise — standard SVG angle math (0deg = 3
  // o'clock) shifted by -90deg, computed directly so it doesn't compound
  // with the progress arc's own rotate() transform below.
  const targetAngleRad = ((-90 + targetPct * 360) * Math.PI) / 180;
  const tickInner = r - 2;
  const tickOuter = r + 5;
  const tx1 = cx + tickInner * Math.cos(targetAngleRad);
  const ty1 = cy + tickInner * Math.sin(targetAngleRad);
  const tx2 = cx + tickOuter * Math.cos(targetAngleRad);
  const ty2 = cy + tickOuter * Math.sin(targetAngleRad);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} stroke="#2A3D59" strokeWidth={stroke} fill="none" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="#F0A83C"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#3FBF8F" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-semibold tabular">{Math.round(value)}%</span>
        <span className="font-mono text-[9px] text-slate uppercase tracking-wide">ready</span>
      </div>
    </div>
  );
}
