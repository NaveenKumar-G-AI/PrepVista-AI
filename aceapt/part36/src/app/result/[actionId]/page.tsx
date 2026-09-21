"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/apiClient";
import { evidenceQualityDisplay, impactDisplay } from "@/lib/presentation";
import Panel from "@/components/Panel";
import StateBadge from "@/components/StateBadge";
import type { ActionItem, EvidenceQuality, ActionOutcomeRecord } from "@/lib/types";

interface CompleteResponse {
  action: ActionItem;
  nextPrimary: ActionItem | null;
}
interface EvidenceResponse {
  outcome: ActionOutcomeRecord;
  action: ActionItem;
  nextPrimary: ActionItem | null;
}

const QUALITIES: EvidenceQuality[] = ["SELF_REPORTED", "OBSERVED", "VERIFIED", "MEASURED"];

export default function ResultPage() {
  const { actionId } = useParams<{ actionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const actualMinutes = searchParams.get("actualMinutes");

  const [completed, setCompleted] = useState<CompleteResponse | null>(null);
  const [quality, setQuality] = useState<EvidenceQuality>("SELF_REPORTED");
  const [scoreValue, setScoreValue] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<EvidenceResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    apiPost<CompleteResponse>(`/api/career/execution/actions/${actionId}/complete`, {
      actualMinutes: actualMinutes ? Number(actualMinutes) : undefined,
    }).then(setCompleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId]);

  async function submitEvidence() {
    setBusy(true);
    try {
      const res = await apiPost<EvidenceResponse>(`/api/career/execution/actions/${actionId}/evidence`, {
        evidenceQuality: quality,
        scoreValue: scoreValue.trim() ? Number(scoreValue) : null,
        notes: notes.trim() || null,
      });
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  if (!completed) {
    return <p className="py-16 text-center text-sm text-ink-muted">Recording your progress…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Action</p>
        <p className="font-display text-xl font-semibold text-ink">{completed.action.title}</p>
        <p className="mt-1 text-sm text-ink-muted">Marked as completed. Add a result if you have one — this is what tells ACEAPT what to recommend next.</p>
      </div>

      {!result ? (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Did it work?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUALITIES.map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`border px-3 py-1.5 text-xs ${quality === q ? "border-brass bg-brass-soft text-brass-strong" : "border-hairline text-ink-muted"}`}
              >
                {evidenceQualityDisplay(q).label}
              </button>
            ))}
          </div>

          {(quality === "MEASURED" || quality === "VERIFIED") && (
            <div className="mt-4">
              <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Score (optional, any scale you use)</label>
              <input
                type="number"
                value={scoreValue}
                onChange={(e) => setScoreValue(e.target.value)}
                className="tnum mt-1 w-32 border border-hairline bg-surface px-3 py-2 text-sm text-ink"
                placeholder="e.g. 72"
              />
              <p className="mt-1 text-xs text-ink-faint">ACEAPT compares this to your prior results in the same area — it never invents a score for you.</p>
            </div>
          )}

          <div className="mt-4">
            <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink"
              placeholder="What happened, what felt hard, what you noticed…"
            />
          </div>

          <div className="mt-5 flex gap-3">
            <button onClick={submitEvidence} disabled={busy} className="bg-brass px-5 py-2.5 text-sm font-medium text-white hover:bg-brass-strong disabled:opacity-50">
              {busy ? "Saving…" : "Save result"}
            </button>
            <Link href="/today" className="px-4 py-2.5 text-sm text-ink-muted underline underline-offset-2">
              Skip for now
            </Link>
          </div>
        </Panel>
      ) : (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Impact</p>
          <div className="mt-2">
            <StateBadge {...impactDisplay(result.outcome.impact)} />
          </div>
          {result.outcome.nextRecommendation && <p className="mt-3 text-sm text-ink-muted">{result.outcome.nextRecommendation}</p>}
          <Link href="/today" className="mt-5 inline-block bg-brass px-5 py-2.5 text-sm font-medium text-white hover:bg-brass-strong">
            Continue to Today
          </Link>
        </Panel>
      )}
    </div>
  );
}
