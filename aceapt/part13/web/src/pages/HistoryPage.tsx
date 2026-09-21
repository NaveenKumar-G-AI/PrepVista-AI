import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fmtDateTime, fmtPct } from "../lib/format";
import type { SimulationSummary } from "../lib/types";

const MODE_LABELS: Record<string, string> = {
  topic_practice: "Topic Practice",
  timed_practice: "Timed Practice",
  mixed_practice: "Mixed Practice",
  realistic_simulation: "Realistic Simulation",
};

export default function HistoryPage() {
  const [sims, setSims] = useState<SimulationSummary[] | null>(null);

  useEffect(() => {
    api.get<{ simulations: SimulationSummary[] }>("/simulations").then((d) => setSims(d.simulations));
  }, []);

  if (!sims) return <div className="text-center text-paper-500 py-24 text-sm">Loading history…</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="label-caps mb-2">History</div>
      <h1 className="font-display text-2xl font-semibold text-paper-100 mb-6">Simulation History</h1>

      {sims.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-paper-500">No simulations yet.</div>
      ) : (
        <div className="panel divide-y hairline">
          {sims.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-sm font-medium text-paper-100">{MODE_LABELS[s.practiceMode] ?? s.practiceMode}</div>
                <div className="text-xs text-paper-500 mt-0.5">
                  {s.status === "submitted" ? fmtDateTime(s.submittedAt) : s.status.replace("_", " ")} · {s.questionCount} questions
                </div>
              </div>
              <div className="flex items-center gap-4">
                {s.accuracy !== null && <span className="data-figure text-sm text-paper-100">{fmtPct(s.accuracy * 100)}</span>}
                {s.status === "submitted" ? (
                  <Link to={`/simulations/${s.id}/postmortem`} className="label-caps text-signal-ready hover:underline">
                    Postmortem
                  </Link>
                ) : s.status === "in_progress" || s.status === "not_started" ? (
                  <Link to={`/simulations/${s.id}/run`} className="label-caps text-signal-developing hover:underline">
                    Resume
                  </Link>
                ) : (
                  <span className="label-caps text-paper-500">Abandoned</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
