import { useEffect, useState } from "react";
import { Play, Clock, ListChecks, ShieldAlert, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import type { MockHistoryEntry } from "../lib/types";

interface Props {
  onStart: () => void;
  starting: boolean;
}

export default function IntroScreen({ onStart, starting }: Props) {
  const [history, setHistory] = useState<MockHistoryEntry[] | null>(null);

  useEffect(() => {
    api
      .getMockHistory()
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
          <ShieldAlert size={22} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Real-World Aptitude Simulation</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-500">
          Mixed topics, mixed difficulty, no topic labels, no hints — a realistic placement-style test, not a practice
          set.
        </p>

        <div className="mx-auto mt-8 grid max-w-sm grid-cols-2 gap-4 text-left">
          <InfoRow icon={<ListChecks size={16} />} label="15 Questions" />
          <InfoRow icon={<Clock size={16} />} label="18 Minutes" />
        </div>

        <div className="mx-auto mt-4 max-w-sm rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-600">
          <div className="mb-1 font-semibold text-slate-700">Marking scheme</div>
          <div>+1 for correct · −0.25 for wrong · 0 for unattempted</div>
        </div>

        <button
          onClick={onStart}
          disabled={starting}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          <Play size={18} />
          {starting ? "Starting…" : "Start Simulation"}
        </button>
      </div>

      {history && history.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <TrendingUp size={16} /> Your recent mocks
          </div>
          <div className="space-y-2">
            {history.slice(0, 5).map((h) => (
              <div key={h.sessionId} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{new Date(h.completedAt).toLocaleDateString()}</span>
                <span className="font-mono text-slate-700">
                  {h.score}/{h.maxScore}
                </span>
                <span className="text-slate-500">{h.accuracyPct}% accuracy</span>
                <SelectionBadge quality={h.selectionQuality} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
      <span className="text-indigo-600">{icon}</span>
      <span className="font-medium text-slate-700">{label}</span>
    </div>
  );
}

function SelectionBadge({ quality }: { quality: string }) {
  const map: Record<string, string> = {
    Strong: "bg-emerald-100 text-emerald-700",
    Moderate: "bg-amber-100 text-amber-700",
    Weak: "bg-rose-100 text-rose-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[quality] || "bg-slate-100 text-slate-600"}`}>{quality}</span>;
}
