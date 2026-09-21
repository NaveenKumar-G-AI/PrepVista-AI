import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PriorityBreakdownTerm } from "../types";

interface EvidenceReadoutProps {
  why: string;
  metrics?: { label: string; value: string }[];
  breakdown?: PriorityBreakdownTerm[];
}

export function EvidenceReadout({ why, metrics, breakdown }: EvidenceReadoutProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-l-2 border-signal/70 pl-3">
      {metrics && metrics.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wide text-signal">
          {metrics.map((m) => (
            <span key={m.label}>
              {m.label} <span className="text-paper">{m.value}</span>
            </span>
          ))}
        </div>
      )}
      <p className="text-sm leading-relaxed text-muted">{why}</p>

      {breakdown && breakdown.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-faint transition-colors hover:text-muted"
          >
            <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Hide the scoring" : "See how this was scored"}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1 border-t border-line-soft pt-2 font-mono text-[11px] text-faint">
              {breakdown.map((term) => (
                <li key={term.factor} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{term.factor}</span>
                  <span>
                    {term.rawValue.toFixed(2)} × {term.weight.toFixed(2)} ={" "}
                    <span className="text-paper">{term.contribution.toFixed(3)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
