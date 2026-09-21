"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionItem } from "@/lib/types";
import { formatMinutes, actionTypeDisplay, DEFER_REASON_OPTIONS } from "@/lib/presentation";
import { apiPost } from "@/lib/apiClient";

export default function PrimaryActionCard({
  action,
  onChanged,
}: {
  action: ActionItem;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [showDefer, setShowDefer] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDefer(reasonCode: string) {
    setBusy(true);
    try {
      await apiPost(`/api/career/execution/actions/${action.id}/defer`, { reasonCode });
      onChanged();
    } finally {
      setBusy(false);
      setShowDefer(false);
    }
  }

  return (
    <section className="border border-hairline-strong bg-surface">
      <div className="border-b border-hairline px-6 py-3 sm:px-8">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Your next move</p>
      </div>

      <div className="px-6 py-6 sm:px-8 sm:py-8">
        <h2 className="font-display text-2xl font-semibold leading-snug text-ink sm:text-3xl">{action.title}</h2>
        {action.description && <p className="mt-2 text-sm text-ink-muted">{action.description}</p>}

        {action.rationaleBullets.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Why this action?</p>
            <ul className="mt-2 space-y-1.5">
              {action.rationaleBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-brass" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-hairline pt-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-faint">Time</p>
            <p className="tnum text-lg text-ink">{formatMinutes(action.estimatedMinutes)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-faint">Type</p>
            <p className="text-sm text-ink">{actionTypeDisplay(action.actionType).label}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => router.push(`/session/${action.id}`)}
            className="bg-brass px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brass-strong"
          >
            Start now
          </button>
          <button
            onClick={() => router.push(`/blocked/${action.id}`)}
            className="border border-hairline px-4 py-2.5 text-sm text-ink-muted hover:border-hairline-strong hover:text-ink"
          >
            I&apos;m blocked
          </button>
          <button
            onClick={() => setShowDefer((v) => !v)}
            className="px-4 py-2.5 text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Not now
          </button>
        </div>

        {showDefer && (
          <div className="mt-4 border border-hairline bg-surface-recessed p-4">
            <p className="text-sm text-ink-muted">What&apos;s the reason? Your plan will adjust — nothing here is a strike against you.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEFER_REASON_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  disabled={busy}
                  onClick={() => handleDefer(opt.code)}
                  className="border border-hairline bg-surface px-3 py-1.5 text-xs text-ink hover:border-hairline-strong disabled:opacity-50"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
