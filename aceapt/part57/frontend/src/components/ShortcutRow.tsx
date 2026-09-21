import type { ShortcutSummary } from '../types';
import { StatusDot } from './StatusDot';

function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function ShortcutRow({ shortcut, onOpen }: { shortcut: ShortcutSummary; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-4 border-b border-line py-4 text-left transition-colors hover:bg-surface"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-display text-lg text-ink">{shortcut.canonicalName}</span>
          {shortcut.isPersonal && (
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-inksoft">Yours</span>
          )}
          {shortcut.pinned && <span className="shrink-0 text-[11px] text-focus">Pinned</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-sm text-inksoft">
          <StatusDot state={shortcut.trustState} />
          <span aria-hidden>·</span>
          <span>{shortcut.domain || shortcut.category || shortcut.strategyType.replace(/_/g, ' ').toLowerCase()}</span>
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end font-mono tabular text-sm text-inksoft sm:flex">
        <span>{shortcut.usageCount > 0 ? formatPercent(shortcut.reliability) : '—'}</span>
        <span className="text-xs">
          {shortcut.usageCount} use{shortcut.usageCount === 1 ? '' : 's'}
        </span>
      </div>

      <svg className="h-4 w-4 shrink-0 text-inksoft opacity-0 transition-opacity group-hover:opacity-100" viewBox="0 0 16 16" fill="none">
        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
