import { useState } from "react";
import { DEMO_TARGETS } from "../api/client";
import type { TargetComparison } from "../types";

const OPTIONS = [
  { id: DEMO_TARGETS.dataAnalyst, name: "Data Analyst" },
  { id: DEMO_TARGETS.softwareDeveloper, name: "Software Developer" },
  { id: DEMO_TARGETS.businessAnalyst, name: "Business Analyst" },
];

export function TargetSwitcher({
  currentTargetId,
  onSelect,
  lastComparison,
  onClose,
}: {
  currentTargetId: string | undefined;
  onSelect: (targetId: string) => Promise<void>;
  lastComparison: TargetComparison | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body">Change target</div>
        <button onClick={onClose} className="text-xs text-ink-3 hover:text-ink-2 font-body">
          Close
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            disabled={busy || opt.id === currentTargetId}
            onClick={async () => {
              setBusy(true);
              try {
                await onSelect(opt.id);
              } finally {
                setBusy(false);
              }
            }}
            className={`text-left rounded-md border px-3 py-2.5 text-sm font-body transition-colors ${
              opt.id === currentTargetId ? "border-route/40 bg-route/5 text-route" : "border-base-border text-ink-1 hover:bg-base-surface2"
            }`}
          >
            {opt.name}
            {opt.id === currentTargetId && <span className="ml-2 text-xs text-ink-3">current</span>}
          </button>
        ))}
      </div>
      {lastComparison && (
        <div className="mt-4 pt-4 border-t border-base-border text-sm font-body">
          <p className="text-ink-1">
            <span className="font-mono text-route">{lastComparison.transferablePercent.toFixed(0)}%</span> of your existing preparation carries over.
          </p>
          {lastComparison.sharedCapabilities.length > 0 && <p className="text-xs text-ink-3 mt-1">Shared: {lastComparison.sharedCapabilities.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
