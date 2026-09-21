"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/apiClient";
import { BLOCKER_REASON_OPTIONS, formatMinutes } from "@/lib/presentation";
import Panel from "@/components/Panel";
import type { ActionItem, BlockerReasonCode } from "@/lib/types";

interface BlockResponse {
  action: ActionItem;
  unblockAction: ActionItem | null;
  nextPrimary: ActionItem | null;
}

export default function BlockedPage() {
  const { actionId } = useParams<{ actionId: string }>();
  const router = useRouter();

  const [reasonCode, setReasonCode] = useState<BlockerReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BlockResponse | null>(null);

  async function submit() {
    if (!reasonCode) return;
    setBusy(true);
    try {
      const res = await apiPost<BlockResponse>(`/api/career/execution/actions/${actionId}/block`, {
        reasonCode,
        reasonNote: note.trim() || null,
      });
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <div>
        <p className="font-display text-xl font-semibold text-ink">I&apos;m blocked</p>
        <p className="mt-1 text-sm text-ink-muted">No judgment here — tell ACEAPT what&apos;s in the way and the plan will adjust around it.</p>
      </div>

      {!result ? (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">What&apos;s blocking you?</p>
          <div className="mt-3 flex flex-col gap-2">
            {BLOCKER_REASON_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                onClick={() => setReasonCode(opt.code)}
                className={`border px-3 py-2.5 text-left text-sm ${
                  reasonCode === opt.code ? "border-brass bg-brass-soft text-brass-strong" : "border-hairline text-ink hover:border-hairline-strong"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Anything else? (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>

          <button
            onClick={submit}
            disabled={!reasonCode || busy}
            className="mt-5 bg-brass px-5 py-2.5 text-sm font-medium text-white hover:bg-brass-strong disabled:opacity-50"
          >
            {busy ? "Adjusting your plan…" : "Submit"}
          </button>
        </Panel>
      ) : (
        <Panel>
          {result.unblockAction ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Plan adjusted</p>
              <p className="mt-2 text-sm text-ink">
                Added <span className="font-medium">{result.unblockAction.title}</span> ({formatMinutes(result.unblockAction.estimatedMinutes)}) to clear
                the way — then you&apos;ll return to the original action.
              </p>
              <Link href={`/session/${result.unblockAction.id}`} className="mt-4 inline-block bg-brass px-5 py-2.5 text-sm font-medium text-white hover:bg-brass-strong">
                Start it now
              </Link>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Your plan may need adjustment</p>
              <p className="mt-2 text-sm text-ink">This action has been moved out of today&apos;s plan. It&apos;ll come back when the timing is right.</p>
            </>
          )}
          <div>
            <button onClick={() => router.push("/today")} className="mt-4 block text-sm text-ink-muted underline underline-offset-2">
              Back to Today
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}
