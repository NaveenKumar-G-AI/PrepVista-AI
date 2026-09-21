import type { ReactNode } from "react";
import type { Confidence, Trend, ActionPriority } from "../types";

// ---------- State views ----------
// Per spec section 29/30: explain what happened and what to do, in the
// interface's calm voice — never a raw error, never a mood-y illustration.

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16" role="status" aria-live="polite">
      <p className="mb-6 text-sm text-ink-muted">{label ?? "Loading your readiness analysis…"}</p>
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-card bg-line/60" />
        <div className="h-16 animate-pulse rounded-card bg-line/40" />
        <div className="h-16 animate-pulse rounded-card bg-line/40" />
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center" role="alert">
      <h2 className="font-display text-xl font-semibold">We couldn't load this right now</h2>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>
      <button
        onClick={onRetry}
        className="mt-6 rounded-card bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink/90"
      >
        Try again
      </button>
    </div>
  );
}

export function UnauthorizedState() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <h2 className="font-display text-xl font-semibold">Sign in to see your readiness analysis</h2>
      <p className="mt-2 text-sm text-ink-muted">
        We couldn't confirm who you are. This is a development preview, so it's likely the local session id got
        cleared — refreshing usually fixes it.
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

// ---------- Badges ----------
// Confidence/trend/priority are always shown with a label, not color alone.

const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
  HIGH: { label: "High confidence", className: "bg-accent-soft text-accent border-accent/30" },
  MEDIUM: { label: "Medium confidence", className: "bg-ochre-soft text-ochre border-ochre/30" },
  LOW: { label: "Low confidence — evidence is dated", className: "bg-line/50 text-ink-muted border-line" },
  INSUFFICIENT_DATA: { label: "Not enough evidence yet", className: "border-dashed border-ink-faint text-ink-faint" },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const style = CONFIDENCE_STYLE[confidence];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

const TREND_STYLE: Record<Trend, { label: string; glyph: string; className: string }> = {
  IMPROVING: { label: "Trending up", glyph: "▲", className: "text-accent" },
  DECLINING: { label: "Trending down", glyph: "▼", className: "text-ochre" },
  STABLE: { label: "Holding steady", glyph: "▬", className: "text-ink-muted" },
  INSUFFICIENT_DATA: { label: "Too early to tell", glyph: "·", className: "text-ink-faint" },
};

export function TrendIndicator({ trend }: { trend: Trend }) {
  const style = TREND_STYLE[trend];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${style.className}`}>
      <span aria-hidden="true">{style.glyph}</span>
      {style.label}
    </span>
  );
}

const PRIORITY_STYLE: Record<ActionPriority, { label: string; className: string }> = {
  DO_FIRST: { label: "Do first", className: "bg-accent text-white" },
  DO_NEXT: { label: "Do next", className: "bg-ochre text-white" },
  OPTIONAL: { label: "Optional", className: "bg-line text-ink-muted" },
};

export function PriorityTag({ priority }: { priority: ActionPriority }) {
  const style = PRIORITY_STYLE[priority];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}
