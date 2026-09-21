"use client";

import { EvaluationResult } from "@/lib/engine/types";

const CATEGORY_LABELS: Record<string, string> = {
  detection: "Detection",
  investigation: "Investigation",
  evidenceQuality: "Evidence",
  rootCause: "Root Cause",
  mitigation: "Mitigation",
  permanentFix: "Permanent Fix",
  communication: "Communication",
  prevention: "Prevention",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "#3DD68C" : value >= 60 ? "#E8B93F" : "#F0475A";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-data text-xs text-console-textMuted">{label}</span>
        <span className="font-data text-xs font-semibold" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-console-raised">
        <div className="h-1.5 rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function EvaluationResults({ evaluation }: { evaluation: EvaluationResult }) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-console-border bg-console-surface p-5 shadow-panel">
        <p className="font-data text-xs uppercase tracking-widest text-console-textFaint">Incident response evaluation</p>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-4xl font-semibold">{evaluation.overall}</span>
          <span className="text-sm text-console-textMuted">overall</span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.keys(evaluation.categoryScores) as (keyof typeof evaluation.categoryScores)[]).map((k) => (
            <ScoreBar key={k} label={CATEGORY_LABELS[k] ?? k} value={evaluation.categoryScores[k]} />
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-console-borderMuted pt-4 sm:grid-cols-3">
          <div>
            <p className="font-data text-[10px] uppercase tracking-wide text-console-textFaint">Engineering judgment</p>
            <p className="mt-0.5 text-lg font-semibold">{evaluation.engineeringJudgment}</p>
          </div>
          <div>
            <p className="font-data text-[10px] uppercase tracking-wide text-console-textFaint">Top strength</p>
            <p className="mt-0.5 text-sm">{evaluation.topStrength}</p>
          </div>
          <div>
            <p className="font-data text-[10px] uppercase tracking-wide text-console-textFaint">Top gap</p>
            <p className="mt-0.5 text-sm">{evaluation.topGap}</p>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-accent/25 bg-accent/5 px-3 py-2">
          <p className="font-data text-[10px] uppercase tracking-wide text-accent-glow">Next recommendation</p>
          <p className="mt-0.5 text-sm">{evaluation.nextRecommendation}</p>
        </div>
      </div>

      {evaluation.aiFeedback && (
        <div className="rounded-lg border border-console-border bg-console-surface p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="font-data text-xs uppercase tracking-widest text-console-textFaint">Coaching feedback</p>
            <span className="font-data text-[10px] text-console-textFaint">{evaluation.aiFeedback.source === "ai" ? "AI-generated" : "summary"}</span>
          </div>
          <div className="mt-3 space-y-4">
            {evaluation.aiFeedback.sections.map((s, i) => (
              <div key={i} className="border-t border-console-borderMuted pt-3 first:border-t-0 first:pt-0">
                <p className="text-sm">{s.observation}</p>
                <p className="mt-1 text-xs text-console-textMuted">
                  <span className="font-data text-[10px] uppercase text-console-textFaint">Evidence — </span>
                  {s.evidence}
                </p>
                <p className="mt-1 text-xs text-console-textMuted">
                  <span className="font-data text-[10px] uppercase text-console-textFaint">Impact — </span>
                  {s.impact}
                </p>
                <p className="mt-1 text-xs text-accent-glow">
                  <span className="font-data text-[10px] uppercase text-console-textFaint">Recommendation — </span>
                  {s.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-console-border bg-console-surface p-5 shadow-panel">
        <p className="font-data text-xs uppercase tracking-widest text-console-textFaint">Engineering independence</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="font-data text-[10px] text-console-textFaint">Hints used</p>
            <p className="text-lg font-semibold">{evaluation.independence.hintsUsed}</p>
          </div>
          <div>
            <p className="font-data text-[10px] text-console-textFaint">AI coach calls</p>
            <p className="text-lg font-semibold">{evaluation.independence.aiCallsMade}</p>
          </div>
          <div>
            <p className="font-data text-[10px] text-console-textFaint">Root cause revealed</p>
            <p className="text-lg font-semibold">{evaluation.independence.rootCauseRevealed ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="font-data text-[10px] text-console-textFaint">Independent ratio</p>
            <p className="text-lg font-semibold">{Math.round(evaluation.independence.independentInvestigationRatio * 100)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
