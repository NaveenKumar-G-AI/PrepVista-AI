import type { PathRisk } from "../types";

const SEVERITY_DOT: Record<PathRisk["severity"], string> = {
  LOW: "bg-ink-3",
  MEDIUM: "bg-route",
  HIGH: "bg-risk",
};

export function RiskPanel({ risks }: { risks: PathRisk[] }) {
  if (risks.length === 0) return null;
  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-5">
      <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body mb-3">Risks</div>
      <ul className="flex flex-col gap-3">
        {risks.map((r) => (
          <li key={r.id} className="flex gap-3">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEVERITY_DOT[r.severity]}`} />
            <div>
              <div className="text-sm text-ink-1 font-body">{r.reason}</div>
              <div className="text-xs text-ink-3 font-body mt-0.5">{r.recommendedResponse}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
