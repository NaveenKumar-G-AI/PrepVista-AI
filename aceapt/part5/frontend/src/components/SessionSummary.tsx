import { SessionSummary as SummaryT } from "../types";

export function SessionSummaryView({ summary, onDone }: { summary: SummaryT; onDone: () => void }) {
  const accuracy = summary.totalQuestions ? Math.round((summary.correctCount / summary.totalQuestions) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-cyan">Session complete</div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">
          {summary.correctCount}/{summary.totalQuestions} correct · {accuracy}%
        </h1>
        {summary.adaptationCount > 0 && (
          <p className="mt-1 font-body text-sm text-ink-700/60">
            Difficulty recalibrated {summary.adaptationCount} time{summary.adaptationCount === 1 ? "" : "s"} along the way.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryCard title="What improved" items={summary.whatImproved} tone="positive" />
        <SummaryCard title="What remains weak" items={summary.whatRemainsWeak} tone="attention" />
        <StatCard label="Main error pattern" value={summary.mainErrorPattern.replace(/_/g, " ")} />
        <StatCard label="Speed" value={summary.speedStatus} />
        <StatCard label="Accuracy" value={summary.accuracyStatus} />
        <StatCard label="Mastery status" value={summary.masteryStatus.replace(/_/g, " ")} />
      </div>

      <div className="mt-4 rounded-xl border border-signal-cyan/25 bg-signal-cyan/5 p-5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-signal-cyanDark">Next best action</div>
        <p className="mt-1 font-body text-sm text-ink-900">{summary.nextBestAction}</p>
      </div>

      <button
        onClick={onDone}
        className="mt-6 w-full rounded-md bg-ink-900 py-3 font-body text-sm font-semibold text-white transition-colors hover:bg-ink-800"
      >
        Back to console
      </button>
    </div>
  );
}

function SummaryCard({ title, items, tone }: { title: string; items: string[]; tone: "positive" | "attention" }) {
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-4 shadow-card">
      <div className={`font-mono text-[11px] uppercase tracking-wider ${tone === "positive" ? "text-signal-cyanDark" : "text-signal-amber"}`}>{title}</div>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="font-body text-sm text-ink-900">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-4 shadow-card">
      <div className="font-mono text-[11px] uppercase tracking-wider text-ink-700/50">{label}</div>
      <div className="mt-1 font-display text-base font-medium capitalize text-ink-900">{value.toLowerCase()}</div>
    </div>
  );
}
