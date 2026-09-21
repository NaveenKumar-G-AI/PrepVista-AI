import { useEffect, useState } from "react";
import { api, auth } from "../api";
import { DashboardData, MasteryOverviewEntry } from "../types";
import { Dial } from "./Dial";

interface Props {
  onStartPractice: () => void;
  starting: boolean;
}

export function Dashboard({ onStartPractice, starting }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [mastery, setMastery] = useState<MasteryOverviewEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const studentId = auth.getStudentId();
    Promise.all([api.getDashboard(), studentId ? api.getMasteryOverview(studentId) : Promise.resolve(null)])
      .then(([dash, masteryData]) => {
        setData(dash);
        setMastery(masteryData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard."));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center font-body text-sm text-signal-rust">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="font-mono text-xs text-ink-700/50">Loading console…</span>
      </div>
    );
  }

  const touched = (mastery ?? []).filter((m) => m.state.attemptCount > 0);
  const strongest = [...touched].sort((a, b) => b.state.recentAccuracy - a.state.recentAccuracy)[0];
  const weakest = [...touched].sort((a, b) => a.state.recentAccuracy - b.state.recentAccuracy)[0];
  const slowest = [...touched].filter((m) => m.state.recentAccuracy >= 0.7).sort((a, b) => b.state.averageTimeSeconds - a.state.averageTimeSeconds)[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="grid-texture -mx-4 mb-8 rounded-b-xl bg-ink-900 px-4 py-5 sm:mx-0 sm:rounded-xl sm:px-8 sm:py-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-cyan">Today's objective</div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-white sm:text-3xl">{data.currentGoal}</h1>
        <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-white/70">{data.reason}</p>
      </div>

      {(strongest || weakest || slowest) && (
        <div className="mb-8 flex flex-wrap gap-2">
          {strongest && <SignalChip tone="strong" label={`Strong: ${strongest.skill.name}`} />}
          {weakest && weakest.skill.id !== strongest?.skill.id && <SignalChip tone="weak" label={`Weak: ${weakest.skill.name}`} />}
          {slowest && <SignalChip tone="slow" label={`Slow: ${slowest.skill.name}`} />}
        </div>
      )}

      <div className="mb-8 flex flex-wrap justify-center gap-6 rounded-xl border border-ink-900/8 bg-white py-6 shadow-card sm:justify-around">
        <Dial value={data.accuracy} label="Accuracy" accent="#2E9C90" />
        <Dial value={data.speed} label="Speed" accent="#2E9C90" />
        <Dial value={data.consistency} label="Consistency" accent="#2E9C90" />
      </div>

      {data.recentImprovement.length > 0 && (
        <div className="mb-8">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-700/50">Recent signals</div>
          <div className="flex flex-wrap gap-2">
            {data.recentImprovement.map((r) => (
              <div key={r.skillId} className="flex items-center gap-1.5 rounded-full border border-ink-900/10 bg-white px-3 py-1.5 font-body text-xs text-ink-900">
                <span className={r.direction === "UP" ? "text-signal-cyanDark" : r.direction === "DOWN" ? "text-signal-rust" : "text-ink-700/40"}>
                  {r.direction === "UP" ? "↑" : r.direction === "DOWN" ? "↓" : "→"}
                </span>
                {r.skillName}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-ink-900/8 bg-white p-5 shadow-card">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-700/50">Next best action</div>
        <p className="mt-1 font-body text-sm text-ink-900">{data.nextBestAction}</p>
      </div>

      <button
        onClick={onStartPractice}
        disabled={starting}
        className="w-full rounded-lg bg-signal-cyan py-4 font-display text-base font-semibold text-white shadow-card transition-colors hover:bg-signal-cyanDark disabled:opacity-60"
      >
        {starting ? "Preparing session…" : data.hasActiveSession ? "Resume Practice" : "Start Practice"}
      </button>
    </div>
  );
}

function SignalChip({ label, tone }: { label: string; tone: "strong" | "weak" | "slow" }) {
  const styles = {
    strong: "border-signal-cyan/30 bg-signal-cyan/8 text-signal-cyanDark",
    weak: "border-signal-rust/30 bg-signal-rust/8 text-signal-rust",
    slow: "border-signal-amber/30 bg-signal-amber/8 text-signal-amber",
  }[tone];
  return <span className={`rounded-full border px-3 py-1 font-mono text-[11px] font-medium ${styles}`}>{label}</span>;
}
