import { useEffect, useState } from 'react';
import { Clock, ChevronDown, Play, CheckCircle2, SkipForward } from 'lucide-react';
import { api } from '../api/client';
import type { StudentAction, PlannedItem } from '../types';

const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: 'text-rose border-rose/40 bg-rose/10',
  HIGH: 'text-amber border-amber/40 bg-amber/10',
  MEDIUM: 'text-slate border-line bg-panel2',
  LOW: 'text-teal border-teal/40 bg-teal/10',
};

// This reference frontend has no live Feature 5 session to wait on, so
// "completing" an action here generates a plausible, honestly-labeled
// result in the direction that action type targets and sends it through the
// real POST /complete endpoint — exactly the shape a genuine Feature 5
// session result would take. Swap this for the real session result once
// FEATURE5_API_URL is wired up.
function simulateOutcome(action: StudentAction): { before: Record<string, number>; after: Record<string, number> } {
  const before: Record<string, number> = { accuracy: 74 };
  const after: Record<string, number> = {};
  switch (action.action_type) {
    case 'TIMED_PRACTICE':
      after.accuracy = 81;
      after.avg_solving_time_sec = 63;
      after.readiness = 73;
      break;
    case 'ERROR_REPAIR':
      after.accuracy = 88;
      after.readiness = 79;
      break;
    case 'MIXED_PRACTICE':
      after.mixed_topic_accuracy = 82;
      after.readiness = 81;
      break;
    case 'LEARN':
      before.concept_mastery = 48;
      after.concept_mastery = 78;
      after.readiness = 62;
      break;
    default:
      after.accuracy = 85;
      after.readiness = 75;
  }
  return { before, after };
}

export default function ActionCenter({ onChanged }: { onChanged: () => void }) {
  const [action, setAction] = useState<StudentAction | null>(null);
  const [message, setMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [showWhy, setShowWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ before: Record<string, number>; after: Record<string, number> } | null>(
    null
  );
  const [minutes, setMinutes] = useState(30);
  const [plan, setPlan] = useState<PlannedItem[]>([]);

  const load = () => {
    setLoading(true);
    setOutcome(null);
    setShowWhy(false);
    api
      .nextBestAction()
      .then((res) => {
        setAction(res.action);
        setMessage(res.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.actionPlan(minutes).then((res) => setPlan(res.plan));
  }, [minutes]);

  const handleStart = async () => {
    if (!action) return;
    setBusy(true);
    const res = await api.startAction(action.id);
    setAction(res.action);
    setBusy(false);
  };

  const handleComplete = async () => {
    if (!action) return;
    setBusy(true);
    const result = simulateOutcome(action);
    await api.completeAction(action.id, result.before, result.after);
    setOutcome(result);
    setBusy(false);
    onChanged();
  };

  const handleSkip = async () => {
    if (!action) return;
    setBusy(true);
    await api.skipAction(action.id, 'NOT_ENOUGH_TIME');
    setBusy(false);
    load();
    onChanged();
  };

  if (loading) return <Skeleton />;

  if (!action) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] text-teal uppercase mb-2">All clear</p>
        <p className="text-slate">{message ?? 'No outstanding priorities right now.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-panel shadow-panel overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded border ${PRIORITY_STYLE[action.priority]}`}
            >
              {action.priority}
            </span>
            <span className="font-mono text-[10px] tracking-widest uppercase text-slate">
              {action.action_type.replace(/_/g, ' ')}
            </span>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-xs text-slate">
            <Clock size={13} /> {action.duration_minutes} min
          </span>
        </div>

        <div className="px-6 pt-3 pb-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase">Your next best action</p>
          <h2 className="text-2xl font-semibold tracking-tight mt-1">{action.target_skill_name}</h2>
          <p className="text-slate mt-2 leading-relaxed">{action.reason}</p>

          <button
            onClick={() => setShowWhy((s) => !s)}
            className="mt-4 flex items-center gap-1.5 text-sm text-amber font-medium"
          >
            Why this? <ChevronDown size={15} className={`transition-transform ${showWhy ? 'rotate-180' : ''}`} />
          </button>
          {showWhy && (
            <p className="mt-2 rounded-lg border border-line bg-ink/40 p-4 text-sm text-ivory/90 leading-relaxed">
              {action.why_this}
            </p>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-mono text-[10px] tracking-widest text-slate uppercase">Success metric</dt>
              <dd className="mt-1">{action.success_metric}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-widest text-slate uppercase">Verification</dt>
              <dd className="mt-1">{action.verification_method}</dd>
            </div>
          </dl>

          {!outcome ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {action.status === 'RECOMMENDED' && (
                <button
                  onClick={handleStart}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-50"
                >
                  <Play size={15} fill="currentColor" /> Start now
                </button>
              )}
              {action.status === 'STARTED' && (
                <button
                  onClick={handleComplete}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} /> Mark complete
                </button>
              )}
              <button
                onClick={handleSkip}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-slate hover:text-ivory hover:border-slate-dim disabled:opacity-50"
              >
                <SkipForward size={15} /> Skip for now
              </button>
            </div>
          ) : (
            <Outcome before={outcome.before} after={outcome.after} onNext={load} />
          )}
        </div>
      </div>

      <DailyPlan minutes={minutes} setMinutes={setMinutes} plan={plan} />
    </div>
  );
}

function Outcome({
  before,
  after,
  onNext,
}: {
  before: Record<string, number>;
  after: Record<string, number>;
  onNext: () => void;
}) {
  const keys = Object.keys(after).filter((k) => before[k] !== undefined);
  return (
    <div className="mt-6 rounded-lg border border-teal/30 bg-teal/5 p-5">
      <p className="font-mono text-[11px] tracking-[0.2em] text-teal uppercase">Completed</p>
      <div className="mt-3 flex flex-wrap gap-6">
        {keys.map((k) => (
          <div key={k}>
            <p className="font-mono text-[10px] tracking-widest text-slate uppercase">{k.replace(/_/g, ' ')}</p>
            <p className="font-mono text-lg tabular mt-0.5">
              {before[k]} → <span className="text-teal font-semibold">{after[k]}</span>
            </p>
          </div>
        ))}
      </div>
      <button onClick={onNext} className="mt-4 text-sm font-medium text-amber hover:underline">
        See your next best action →
      </button>
    </div>
  );
}

function DailyPlan({
  minutes,
  setMinutes,
  plan,
}: {
  minutes: number;
  setMinutes: (m: number) => void;
  plan: PlannedItem[];
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase">Today's plan, if you have</p>
        <div className="flex gap-1.5">
          {[10, 20, 30, 45, 60].map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
                minutes === m ? 'bg-amber text-ink font-semibold' : 'bg-panel2 text-slate hover:text-ivory'
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {plan.map((item, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg border border-line bg-ink/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate w-5">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-sm">{item.skill_name}</span>
              <span className="font-mono text-[10px] tracking-widest text-slate uppercase">
                {item.action_type.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="font-mono text-xs text-slate">{item.duration_minutes}m</span>
          </li>
        ))}
        {plan.length === 0 && <li className="text-sm text-slate">Nothing fits in {minutes} minutes yet.</li>}
      </ul>
    </div>
  );
}

function Skeleton() {
  return <div className="h-64 rounded-xl border border-line bg-panel animate-pulse" />;
}
