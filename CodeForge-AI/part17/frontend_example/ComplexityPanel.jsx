/**
 * ComplexityPanel — REFERENCE ONLY.
 *
 * This shows how to consume the ComplexityReport JSON shape returned by
 * POST /analyze (see complexity_engine/report.py for the exact fields).
 * It is deliberately plain — swap every element below for your actual
 * design system's components (Card, Badge, etc.). Don't ship this file
 * as-is; the point is the data wiring, not the visual design, which the
 * master spec explicitly says should come from CodeForge's existing
 * design system rather than a disconnected one built from scratch here.
 *
 * Usage:
 *   <ComplexityPanel report={reportJson} onJumpToLine={(line) => ...} />
 */
import { useState } from "react";

const CONFIDENCE_STYLE = {
  HIGH: "text-emerald-700 bg-emerald-50 border-emerald-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-orange-700 bg-orange-50 border-orange-200",
  UNKNOWN: "text-slate-600 bg-slate-50 border-slate-200",
};

const RISK_STYLE = {
  "LOW RISK": "text-emerald-700 bg-emerald-50",
  "MODERATE RISK": "text-amber-700 bg-amber-50",
  "HIGH RISK": "text-orange-700 bg-orange-50",
  "LIKELY INFEASIBLE": "text-red-700 bg-red-50",
  UNKNOWN: "text-slate-600 bg-slate-50",
};

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-lg font-mono font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function ComplexityPanel({ report, onJumpToLine }) {
  const [showFindings, setShowFindings] = useState(false);
  if (!report) return null;

  const { time_complexity, space_complexity, best_case, dominant_cost, confidence,
          findings, constraint_assessment, recursive, ai_explanation } = report;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 max-w-md">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Complexity</h3>
        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${CONFIDENCE_STYLE[confidence] || CONFIDENCE_STYLE.UNKNOWN}`}>
          {confidence}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Time" value={time_complexity.notation} />
        <Stat label="Space" value={space_complexity.notation} />
      </div>

      {best_case && (
        <Stat label="Best case" value={best_case.notation} />
      )}

      <div>
        <span className="text-xs uppercase tracking-wide text-slate-500">Dominant cost</span>
        <p className="text-sm text-slate-800 mt-1">{dominant_cost}</p>
      </div>

      {constraint_assessment && (
        <div className={`text-xs font-medium px-2 py-1.5 rounded-md inline-block ${RISK_STYLE[constraint_assessment.risk] || RISK_STYLE.UNKNOWN}`}>
          {constraint_assessment.risk} — {constraint_assessment.explanation}
        </div>
      )}

      {recursive && (
        <p className="text-xs text-slate-500">Recursive solution — complexity derived from the recurrence, not a loop count.</p>
      )}

      {ai_explanation && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-700">{ai_explanation.summary}</p>
          {ai_explanation.optimization_opportunities?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {ai_explanation.optimization_opportunities.map((opt, i) => (
                <li key={i} className="text-xs text-slate-600">• {opt}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <button
          className="text-xs text-slate-500 underline underline-offset-2"
          onClick={() => setShowFindings((s) => !s)}
        >
          {showFindings ? "Hide" : "Show"} evidence ({findings.length})
        </button>
        {showFindings && (
          <ul className="mt-2 space-y-1.5">
            {findings.map((f, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-2">
                <span className={`shrink-0 px-1.5 rounded ${CONFIDENCE_STYLE[f.confidence] || CONFIDENCE_STYLE.UNKNOWN}`}>
                  {f.kind}
                </span>
                <span>
                  {f.description}
                  {f.line && (
                    <button
                      className="ml-1 text-slate-400 underline underline-offset-2"
                      onClick={() => onJumpToLine?.(f.line)}
                    >
                      line {f.line}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
