"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/apiClient";
import type { ActionItem, ExecutionSessionPhase } from "@/lib/types";

interface StartResponse {
  action: ActionItem;
  session: { id: string; plannedMinutes: number; phases: ExecutionSessionPhase[] };
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export default function SessionPage() {
  const { actionId } = useParams<{ actionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedMinutes = searchParams.get("minutes");

  const [data, setData] = useState<StartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    apiPost<StartResponse>(`/api/career/execution/actions/${actionId}/start`, {
      minutes: requestedMinutes ? Number(requestedMinutes) : undefined,
    })
      .then(setData)
      .catch(() => setError("Couldn't start this session — your data is safe, please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId]);

  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [data]);

  function finish() {
    const actualMinutes = Math.max(1, Math.round(elapsedSec / 60));
    router.push(`/result/${actionId}?sessionId=${data?.session.id ?? ""}&actualMinutes=${actualMinutes}`);
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-focus-bg px-6 text-center text-focus-ink">
        <p className="font-display text-lg">{error}</p>
        <button onClick={() => router.push("/today")} className="mt-6 border border-focus-hairline px-4 py-2 text-sm">
          Back to Today
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-focus-bg text-focus-ink-muted">
        <p className="text-sm">Setting up your session…</p>
      </div>
    );
  }

  const { action, session } = data;
  const totalSec = session.plannedMinutes * 60;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  let cursor = 0;
  const currentPhaseIndex = session.phases.findIndex((p) => {
    const start = cursor;
    cursor += p.durationMin * 60;
    return elapsedSec < cursor && elapsedSec >= start;
  });
  const activePhase = session.phases[currentPhaseIndex] ?? session.phases[session.phases.length - 1];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-focus-bg text-focus-ink">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push("/today")} className="text-xs text-focus-ink-muted hover:text-focus-ink">
            ← Exit session
          </button>
          <span className="text-xs uppercase tracking-wider text-focus-ink-muted">Focus mode</span>
        </div>

        <div className="mt-10 flex-1">
          <p className="text-sm text-focus-ink-muted">{action.title}</p>
          <p className="mt-1 font-display text-xl font-medium text-focus-ink">{activePhase?.title ?? "Session"}</p>

          <div className="tnum mt-10 text-center text-7xl font-light text-focus-brass sm:text-8xl">{formatClock(remainingSec)}</div>
          <p className="mt-2 text-center text-xs text-focus-ink-muted">
            {remainingSec === 0 ? "Time's up — finish whenever you're ready" : `of ${session.plannedMinutes} min planned`}
          </p>

          <div className="mt-10 space-y-2">
            {session.phases.map((p, i) => {
              const isActive = i === currentPhaseIndex;
              const isDone = i < currentPhaseIndex;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span
                    className={`h-1.5 flex-1 rounded-full ${isDone ? "bg-focus-brass" : isActive ? "bg-focus-brass/60" : "bg-focus-surface-raised"}`}
                  />
                  <span className={`w-32 flex-none text-right text-xs ${isActive ? "text-focus-ink" : "text-focus-ink-muted"}`}>
                    {p.title} · {p.durationMin}m
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={finish} className="mt-10 w-full border border-focus-brass bg-focus-surface-raised py-3 text-sm font-medium text-focus-ink hover:bg-focus-surface">
          I&apos;m done — see result
        </button>
      </div>
    </div>
  );
}
