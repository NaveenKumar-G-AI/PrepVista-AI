"use client";

import { useState } from "react";
import { apiPost } from "@/lib/apiClient";
import Panel from "./Panel";

export default function GoalOnboarding({ onCreated }: { onCreated: () => void }) {
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetRole = role.trim();
    if (!targetRole) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/career/goal", { title: `Land a ${targetRole} role`, targetRole });
      onCreated();
    } catch {
      setError("Couldn't set that up just now — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mx-auto max-w-lg text-center">
      <p className="font-display text-xl font-semibold text-ink">What&apos;s your career goal?</p>
      <p className="mt-2 text-sm text-ink-muted">
        ACEAPT will build your execution path — milestones, a weekly objective, and a first concrete action — from this.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Backend Developer"
          className="flex-1 border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint sm:max-w-xs"
          autoFocus
        />
        <button
          type="submit"
          disabled={busy || !role.trim()}
          className="bg-brass px-5 py-2.5 text-sm font-medium text-white hover:bg-brass-strong disabled:opacity-50"
        >
          {busy ? "Building your plan…" : "Set goal"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}
    </Panel>
  );
}
