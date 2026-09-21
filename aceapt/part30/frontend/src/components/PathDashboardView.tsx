import { useEffect, useState } from "react";
import type { Identity } from "../api/client";
import { pathApi } from "../api/client";
import type { PathDashboard, PathHistoryEvent, PathSnapshot, TargetComparison, WeeklyReview } from "../types";
import { TargetHeader } from "./TargetHeader";
import { ReadinessInstruments } from "./ReadinessInstruments";
import { FocusPanel } from "./FocusPanel";
import { MilestoneRoute } from "./MilestoneRoute";
import { RiskPanel } from "./RiskPanel";
import { TodayPanel, WeeklyReviewPanel, PathHistoryPanel } from "./SecondaryPanels";
import { InsufficientDataBanner } from "./StatePanels";
import { TargetSwitcher } from "./TargetSwitcher";

export function PathDashboardView({
  identity,
  data,
  onRefresh,
  onSwitchTarget,
}: {
  identity: Identity;
  data: PathDashboard;
  onRefresh: () => Promise<void>;
  onSwitchTarget: (targetId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [lastComparison, setLastComparison] = useState<TargetComparison | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklyReview | null>(null);
  const [history, setHistory] = useState<{ snapshots: PathSnapshot[]; events: PathHistoryEvent[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    pathApi.today(identity, data.target.id).then((r) => !cancelled && setToday(r.narrative));
    pathApi.weeklyReview(identity, data.target.id).then((r) => !cancelled && setWeekly(r as WeeklyReview));
    pathApi.history(identity, data.target.id).then((r) => !cancelled && setHistory(r));
    return () => {
      cancelled = true;
    };
  }, [identity, data.target.id, data.path.lastRecalculatedAt]);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <TargetHeader target={data.target} mode={data.path.mode} deadlineDays={data.path.deadlineDays} projection={data.projection} slot={data.path.slot} />

      {data.lastChange?.summary && (
        <div className="rounded-md border border-base-border bg-base-surface2 px-4 py-3 text-sm text-ink-2 font-body">
          <span className="text-ink-3">Why did my path change? </span>
          {data.lastChange.summary}
        </div>
      )}

      {data.evidenceCoverage < 0.3 && <InsufficientDataBanner onAssess={() => {}} />}

      <div className="flex items-center justify-between">
        <button onClick={() => setShowSwitcher((s) => !s)} className="text-xs font-body text-ink-3 hover:text-ink-2 border border-base-border rounded-md px-3 py-1.5 transition-colors">
          Change target
        </button>
        <button onClick={() => withBusy(onRefresh)} disabled={busy} className="text-xs font-body text-ink-3 hover:text-ink-2 border border-base-border rounded-md px-3 py-1.5 transition-colors disabled:opacity-50">
          Recalculate
        </button>
      </div>

      {showSwitcher && (
        <TargetSwitcher
          currentTargetId={data.target.id}
          lastComparison={lastComparison}
          onClose={() => setShowSwitcher(false)}
          onSelect={(targetId) =>
            withBusy(async () => {
              const res = await pathApi.selectTarget(identity, targetId, "PRIMARY");
              setLastComparison(res.comparison);
              await onSwitchTarget(targetId);
            })
          }
        />
      )}

      <ReadinessInstruments readiness={data.path.readiness} targetReadiness={data.path.targetReadiness} dimensions={data.readinessDimensions} />

      <FocusPanel
        bottleneck={data.bottleneck}
        nextBestAction={data.nextBestAction}
        milestones={data.milestones}
        busy={busy}
        onComplete={async (actionId, result) => {
          await withBusy(() => pathApi.completeAction(identity, actionId, result));
          await onRefresh();
        }}
        onSkip={async (actionId) => {
          await withBusy(() => pathApi.skipAction(identity, actionId));
          await onRefresh();
        }}
        onProve={async (milestoneId) => {
          await withBusy(() => pathApi.proveMilestone(identity, milestoneId));
          await onRefresh();
        }}
      />

      <div>
        <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body mb-3">Milestones</div>
        <MilestoneRoute stages={data.stages} milestones={data.milestones} />
      </div>

      <RiskPanel risks={data.activeRisks} />

      {/* Desktop: full secondary panels. Mobile: today's focus is enough (Section 51). */}
      <div className="hidden md:grid md:grid-cols-2 gap-6">
        {weekly && <WeeklyReviewPanel review={weekly} />}
        {history && <PathHistoryPanel snapshots={history.snapshots} events={history.events} />}
      </div>
      <div className="md:hidden">{today && <TodayPanel narrative={today} />}</div>
    </div>
  );
}
