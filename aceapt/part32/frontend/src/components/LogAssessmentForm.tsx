import { useState } from "react";

interface LogAssessmentFormProps {
  capabilities: { capabilityId: string; capabilityName: string }[];
  submitting: boolean;
  onSubmit: (capabilityId: string, score: number) => void;
  compact?: boolean;
}

export function LogAssessmentForm({ capabilities, submitting, onSubmit, compact }: LogAssessmentFormProps) {
  const [capabilityId, setCapabilityId] = useState(capabilities[0]?.capabilityId ?? "");
  const [score, setScore] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = Number(score);
        if (!capabilityId) {
          setError("Choose a capability.");
          return;
        }
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          setError("Score must be between 0 and 100.");
          return;
        }
        setError(null);
        onSubmit(capabilityId, parsed);
        setScore("");
      }}
    >
      <div>
        <label htmlFor="capability" className="mb-1 block text-xs font-medium text-ink-muted">
          Capability
        </label>
        <select
          id="capability"
          value={capabilityId}
          onChange={(e) => setCapabilityId(e.target.value)}
          className="rounded-card border border-line bg-surface px-2.5 py-1.5 text-sm"
        >
          {capabilities.map((c) => (
            <option key={c.capabilityId} value={c.capabilityId}>
              {c.capabilityName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="score" className="mb-1 block text-xs font-medium text-ink-muted">
          Score (0–100)
        </label>
        <input
          id="score"
          type="number"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-28 rounded-card border border-line bg-surface px-2.5 py-1.5 text-sm"
          placeholder="e.g. 62"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-card bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Log result"}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
