import { FormEvent, useState } from "react";
import { api, auth } from "../api";

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [studentId, setStudentId] = useState("demo-student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!studentId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.devLogin(studentId.trim());
      auth.setSession(token, studentId.trim());
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid-texture flex min-h-screen items-center justify-center bg-ink-900">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-ink-800/60 p-8 shadow-card backdrop-blur">
        <div className="mb-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-cyan">ACEAPT · Feature 5</div>
          <h1 className="mt-1 font-display text-xl font-semibold text-white">Practice Console</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-white/50">Student ID</label>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 font-body text-sm text-white outline-none placeholder:text-white/30 focus:border-signal-cyan"
              placeholder="demo-student"
            />
          </div>
          {error && <p className="font-body text-sm text-signal-rust">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-signal-cyan py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-signal-cyanDark disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Enter console"}
          </button>
        </form>
        <p className="mt-5 text-center font-body text-xs text-white/40">
          Dev-only login — use <span className="font-mono text-white/60">demo-student</span> to see the seeded practice history.
        </p>
      </div>
    </div>
  );
}
