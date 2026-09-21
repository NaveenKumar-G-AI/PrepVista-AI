import clsx from "clsx";

const SEV_COLORS: Record<string, string> = {
  "SEV-1": "bg-sev-critical/15 text-sev-critical border-sev-critical/30",
  "SEV-2": "bg-sev-high/15 text-sev-high border-sev-high/30",
  "SEV-3": "bg-sev-medium/15 text-sev-medium border-sev-medium/30",
  "SEV-4": "bg-sev-low/15 text-sev-low border-sev-low/30",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded border px-2 py-0.5 font-data text-xs font-semibold tracking-wide",
        SEV_COLORS[severity] ?? "bg-console-raised text-console-textMuted border-console-border"
      )}
    >
      {severity}
    </span>
  );
}

const STATE_LABELS: Record<string, string> = {
  CREATED: "Not started",
  ACTIVE: "Active",
  INVESTIGATING: "Investigating",
  MITIGATED: "Mitigated",
  FIXING: "Deploying fix",
  VERIFYING: "Verifying",
  RESOLVED: "Resolved",
  POSTMORTEM: "Postmortem",
  EVALUATED: "Evaluated",
};

export function StateBadge({ state }: { state: string }) {
  const resolved = ["RESOLVED", "POSTMORTEM", "EVALUATED"].includes(state);
  const active = ["ACTIVE", "INVESTIGATING", "MITIGATED", "FIXING", "VERIFYING"].includes(state);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium",
        resolved && "border-sev-healthy/30 bg-sev-healthy/10 text-sev-healthy",
        active && "border-accent/30 bg-accent/10 text-accent-glow",
        !resolved && !active && "border-console-border bg-console-raised text-console-textMuted"
      )}
    >
      <span
        className={clsx("h-1.5 w-1.5 rounded-full", active ? "bg-accent-glow animate-pulseDot" : resolved ? "bg-sev-healthy" : "bg-console-textFaint")}
      />
      {STATE_LABELS[state] ?? state}
    </span>
  );
}

const RISK_COLORS: Record<string, string> = {
  SAFE: "text-sev-healthy border-sev-healthy/30 bg-sev-healthy/10",
  CAUTION: "text-sev-medium border-sev-medium/30 bg-sev-medium/10",
  DANGEROUS: "text-sev-critical border-sev-critical/30 bg-sev-critical/10",
};

export function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded border px-1.5 py-0.5 font-data text-[10px] font-semibold tracking-wide", RISK_COLORS[risk])}>
      {risk}
    </span>
  );
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-console-border bg-console-surface shadow-panel">
      <div className="flex items-center justify-between border-b border-console-borderMuted px-4 py-2.5">
        <h2 className="font-data text-xs font-semibold uppercase tracking-wider text-console-textMuted">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-console-textFaint">{children}</p>;
}
