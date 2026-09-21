import Link from "next/link";
import type { ActionItem } from "@/lib/types";
import { formatMinutes, actionTypeDisplay, actionStatusDisplay } from "@/lib/presentation";
import StateBadge from "./StateBadge";

export default function ActionRow({ action, showStatus = false }: { action: ActionItem; showStatus?: boolean }) {
  const status = actionStatusDisplay(action.status);
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hairline py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{action.title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {actionTypeDisplay(action.actionType).label} · <span className="tnum">{formatMinutes(action.estimatedMinutes)}</span>
        </p>
      </div>
      <div className="flex flex-none items-center gap-3">
        {showStatus && <StateBadge label={status.label} tone={status.tone} />}
        {(action.status === "NOT_STARTED" || action.status === "STARTED") && (
          <Link href={`/session/${action.id}`} className="whitespace-nowrap text-xs font-medium text-brass-strong underline underline-offset-2">
            {action.status === "STARTED" ? "Resume" : "Start"}
          </Link>
        )}
      </div>
    </div>
  );
}
