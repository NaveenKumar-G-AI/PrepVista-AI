import { useState, type ReactNode } from "react";
import { getStudentId, setStudentId } from "../../lib/api";

export function StudentIdGate({ children }: { children: ReactNode }) {
  const [id, setId] = useState(getStudentId());
  const [input, setInput] = useState("");

  if (id) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="label-caps mb-2">ACEAPT AI · Feature 13</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Continuous Readiness Engine</h1>
        </div>
        <div className="panel p-6">
          <p className="text-sm text-paper-300 mb-4 leading-relaxed">
            This reference build uses a dev-only identity header instead of real auth (see{" "}
            <code className="data-figure text-xs text-signal-developing">src/api/middleware/auth.ts</code>). Paste the
            demo student ID printed by <code className="data-figure text-xs text-signal-developing">npm run seed</code>{" "}
            in the server directory.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                setStudentId(input);
                setId(input.trim());
              }
            }}
          >
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="data-figure w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2.5 text-sm text-paper-100 placeholder:text-paper-500/50 focus:outline-none focus:border-signal-ready/60 focus:ring-1 focus:ring-signal-ready/30"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="mt-4 w-full rounded-lg bg-signal-ready/10 border border-signal-ready/30 text-signal-ready font-medium text-sm py-2.5 hover:bg-signal-ready/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
