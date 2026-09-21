import { useCallback, useEffect, useRef, useState } from "react";
import "./theme.css";
import { api } from "./api/client";
import type { GoalView } from "./types";
import { GoalCreation } from "./components/GoalCreation";
import { GoalDashboard } from "./components/GoalDashboard";

// Demo-only student switcher - there is no real login in this
// standalone reference implementation (see src/middleware/auth.ts on
// the backend for the dev-mode X-Student-Id header this relies on).
// Replace with the real session/student id once integrated into ACEAPT.
function useDemoStudentId(): [string, (id: string) => void] {
  const [id, setId] = useState(() => localStorage.getItem("demoStudentId") ?? "");
  const update = (next: string) => {
    setId(next);
    localStorage.setItem("demoStudentId", next);
  };
  return [id, update];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function App() {
  const [studentId, setStudentId] = useDemoStudentId();
  const isValidId = UUID_PATTERN.test(studentId);
  const [view, setView] = useState<GoalView | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffPreview, setHandoffPreview] = useState<string | null>(null);
  const latestRequestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!UUID_PATTERN.test(studentId)) {
      // Not a complete id yet (e.g. still being typed) - nothing to do,
      // and importantly nothing to fetch with a fragment.
      setLoading(false);
      setView(null);
      setError(null);
      return;
    }
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const { goals } = await api.listGoals(studentId);
      const active = goals.find((g) => g.status === "ACTIVE" || g.status === "PAUSED");
      const fullView = active ? await api.getGoal(studentId, active.id) : null;
      const exp = active ? await api.getExplanation(studentId, active.id).catch(() => null) : null;

      if (requestId !== latestRequestId.current) return; // a newer request has since started - discard this one
      setView(fullView);
      setExplanation(exp?.explanation ?? null);
    } catch (e) {
      if (requestId !== latestRequestId.current) return;
      setError((e as Error).message);
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--ink-faint)" }}>ACEAPT &middot; FEATURE 44</div>
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder="Student ID (dev mode)"
          className="font-mono"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 10px",
            color: "var(--ink-muted)",
            fontSize: 12,
            width: 220,
          }}
        />
      </div>

      {!isValidId && (
        <p style={{ textAlign: "center", color: "var(--ink-muted)", maxWidth: 480, margin: "80px auto" }}>
          Enter a student id above to continue. In dev mode, any UUID from the <code>students</code> table works - see{" "}
          <code>db/seed.ts</code> for the demo student ids.
        </p>
      )}

      {isValidId && loading && <p style={{ textAlign: "center", color: "var(--ink-muted)" }}>Loading&hellip;</p>}

      {isValidId && !loading && error && (
        <p style={{ textAlign: "center", color: "var(--accent-risk)", maxWidth: 480, margin: "0 auto" }}>{error}</p>
      )}

      {isValidId && !loading && !error && !view && (
        <GoalCreation studentId={studentId} onCreated={refresh} />
      )}

      {isValidId && !loading && view && (
        <>
          <GoalDashboard
            view={view}
            explanation={explanation}
            busy={busy}
            onContinue={() =>
              withBusy(async () => {
                const res = await fetch(
                  `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4044/api"}/goals/${view.goal.id}/handoff/learning`,
                  { headers: { "x-student-id": studentId } }
                );
                const payload = await res.json();
                setHandoffPreview(JSON.stringify(payload, null, 2));
              })
            }
            onRecalculate={() => withBusy(async () => setView(await api.recalculate(studentId, view.goal.id)))}
            onPause={() => withBusy(async () => { await api.pause(studentId, view.goal.id); await refresh(); })}
            onResume={() => withBusy(async () => setView(await api.resume(studentId, view.goal.id)))}
          />
          {handoffPreview && (
            <div style={{ maxWidth: 640, margin: "24px auto 0" }}>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 8 }}>
                Handed off to the existing learning system (Section 41) &mdash;
              </div>
              <pre
                className="font-mono"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: 16,
                  fontSize: 12,
                  color: "var(--ink-muted)",
                  overflowX: "auto",
                }}
              >
                {handoffPreview}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
