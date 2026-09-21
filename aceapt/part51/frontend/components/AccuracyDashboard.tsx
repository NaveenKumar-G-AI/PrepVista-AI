import React, { useEffect, useState } from "react";
import { CalibrationScale } from "./CalibrationScale.js";
import { accuracyApi } from "../lib/api.js";
import type { AccuracyDashboard as AccuracyDashboardData } from "../lib/types.js";

const STATUS_LABEL: Record<AccuracyDashboardData["currentStatus"], string> = {
  improving: "Improving",
  stable: "Stable",
  needs_attention: "Needs attention",
  insufficient_evidence: "Insufficient evidence"
};

const STATUS_BADGE_CLASSES: Record<AccuracyDashboardData["currentStatus"], string> = {
  improving: "border-calibrated text-calibrated",
  stable: "border-accent text-accent",
  needs_attention: "border-attention text-attention",
  insufficient_evidence: "border-accent text-accent"
};

const RECURRENCE_TONE: Record<string, "accent" | "calibrated" | "attention" | "regressed"> = {
  isolated: "accent",
  recurring: "attention",
  clustered: "attention",
  resolved: "calibrated",
  regressed: "regressed"
};

// Tailwind's build-time class scanner needs complete literal class strings —
// `border-${tone}` would silently be purged from the production CSS, so
// every tone gets its own full class list here instead of interpolation.
const FOCUS_BORDER_CLASSES: Record<"accent" | "calibrated" | "attention" | "regressed", string> = {
  accent: "border-accent",
  calibrated: "border-calibrated",
  attention: "border-attention",
  regressed: "border-regressed"
};

function humanize(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export interface AccuracyDashboardProps {
  onStartTraining?: (focus: AccuracyDashboardData["currentFocus"]) => void;
}

export function AccuracyDashboard({ onStartTraining }: AccuracyDashboardProps) {
  const [data, setData] = useState<AccuracyDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    accuracyApi
      .getDashboard()
      .then((d) => !cancelled && setData(d as AccuracyDashboardData))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div className="border border-regressed bg-regressed-soft p-4 text-sm text-regressed">Couldn't load precision data: {error}</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-ink-soft">Reading calibration history…</div>;
  }

  const statusTone: "accent" | "calibrated" | "attention" | "regressed" =
    data.currentStatus === "improving" ? "calibrated" : data.currentStatus === "needs_attention" ? "attention" : "accent";

  return (
    <div className="mx-auto max-w-xl border border-rule bg-paper p-6 font-sans text-ink">
      <div className="flex items-center justify-between border-b border-rule pb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">Precision</h2>
        <span className={`border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[data.currentStatus]}`}>
          {STATUS_LABEL[data.currentStatus]}
        </span>
      </div>

      <div className="mt-4">
        <CalibrationScale label="Overall accuracy" value={data.overallAccuracy} target={90} sampleSize={data.sampleSize} tone={statusTone} />
        <CalibrationScale label="Independent accuracy" value={data.independentAccuracy} target={90} dense tone="accent" />
        <CalibrationScale label="Timed accuracy" value={data.timedAccuracy} target={90} dense tone="accent" />
      </div>

      {data.strongestSkill && (
        <p className="mt-4 border-t border-rule pt-3 text-sm text-ink-soft">
          Strongest:{" "}
          <span className="font-mono-tabular font-medium text-ink">
            {data.strongestSkill.skillId.slice(0, 8)} · {data.strongestSkill.accuracy.toFixed(1)}%
          </span>
        </p>
      )}

      {data.currentFocus ? (
        <div className={`mt-4 border-l-4 ${FOCUS_BORDER_CLASSES[RECURRENCE_TONE[data.currentFocus.recurrenceStatus] ?? "accent"]} bg-paper-raised p-4`}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <CrosshairIcon />
            Current focus
          </div>
          <p className="mt-1 text-base font-medium text-ink">{humanize(data.currentFocus.errorType)}</p>
          <p className="mt-1 text-sm text-ink-soft">{data.currentFocus.reason}</p>
          <button
            type="button"
            onClick={() => onStartTraining?.(data.currentFocus)}
            className="mt-3 border border-ink px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper"
          >
            Start precision training
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">No active bottleneck identified yet — keep practicing to build evidence.</p>
      )}
    </div>
  );
}

function CrosshairIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7" y1="0.5" x2="7" y2="3.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7" y1="10.5" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="0.5" y1="7" x2="3.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10.5" y1="7" x2="13.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
