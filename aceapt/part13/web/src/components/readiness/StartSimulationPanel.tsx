import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import type { AssessmentProfile, PracticeMode, StartSimulationResult } from "../../lib/types";

const MODES: { value: PracticeMode; label: string; blurb: string }[] = [
  { value: "topic_practice", label: "Topic Practice", blurb: "Untimed, single-topic focus" },
  { value: "timed_practice", label: "Timed Practice", blurb: "A clock, still forgiving" },
  { value: "mixed_practice", label: "Mixed Practice", blurb: "Timed and topic-mixed" },
  { value: "realistic_simulation", label: "Realistic Simulation", blurb: "Full exam conditions" },
];

export function StartSimulationPanel({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<AssessmentProfile[]>([]);
  const [profileId, setProfileId] = useState<string>("");
  const [mode, setMode] = useState<PracticeMode>("realistic_simulation");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<{ profiles: AssessmentProfile[] }>("/assessment-profiles").then((d) => {
      setProfiles(d.profiles);
      if (d.profiles[0]) setProfileId(d.profiles[0].id);
    });
  }, []);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const result = await api.post<StartSimulationResult>("/simulations", { profileId, practiceMode: mode });
      navigate(`/simulations/${result.simulationId}/instructions`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start simulation");
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm px-6" onClick={onClose}>
      <div className="panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold text-paper-100 mb-4">Start a simulation</h2>

        <label className="label-caps block mb-2">Assessment profile</label>
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2.5 text-sm text-paper-100 mb-5 focus:outline-none focus:border-signal-ready/60"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.questionCount}q / {p.durationMinutes}m
            </option>
          ))}
        </select>

        <label className="label-caps block mb-2">Practice mode</label>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                mode === m.value ? "border-signal-ready/50 bg-signal-ready/5" : "border-ink-600 hover:border-ink-500"
              }`}
            >
              <div className={`text-sm font-medium ${mode === m.value ? "text-signal-ready" : "text-paper-100"}`}>{m.label}</div>
              <div className="text-xs text-paper-500 mt-0.5">{m.blurb}</div>
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-signal-risk mb-4">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-ink-600 text-paper-300 text-sm py-2.5 hover:border-ink-500">
            Cancel
          </button>
          <button
            onClick={start}
            disabled={starting || !profileId}
            className="flex-1 rounded-lg bg-signal-ready text-ink-950 font-medium text-sm py-2.5 hover:bg-signal-ready/90 disabled:opacity-50"
          >
            {starting ? "Assembling…" : "Begin"}
          </button>
        </div>
      </div>
    </div>
  );
}
