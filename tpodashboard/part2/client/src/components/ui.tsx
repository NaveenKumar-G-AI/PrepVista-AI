import type { ButtonHTMLAttributes, FC, ReactNode } from "react";

export const STAGE_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  REQUIREMENT_RECEIVED: "Requirement received",
  DRIVE_SCHEDULED: "Drive scheduled",
  DRIVE_COMPLETED: "Drive completed",
  HIRING: "Hiring",
  REPEAT_RECRUITER: "Repeat recruiter",
  INACTIVE: "Inactive",
};

export const StageBadge: FC<{ stage: string }> = ({ stage }) => (
  <span className="inline-flex items-center rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-soft">
    {STAGE_LABELS[stage] ?? stage}
  </span>
);

export const PriorityBadge: FC<{ priority: string }> = ({ priority }) => {
  const styles: Record<string, string> = {
    LOW: "bg-line text-ink-soft",
    MEDIUM: "bg-harbor/10 text-harbor",
    HIGH: "bg-gold/15 text-gold",
    CRITICAL: "bg-signal-risk/15 text-signal-risk",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[priority] ?? styles.MEDIUM}`}>
      {priority}
    </span>
  );
};

export const Button: FC<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }
> = ({ variant = "secondary", className = "", children, ...props }) => {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-harbor text-white hover:bg-harbor-strong",
    secondary: "bg-surface border border-line text-ink hover:bg-paper",
    ghost: "text-ink-soft hover:text-ink hover:bg-paper",
    danger: "bg-surface border border-signal-risk/30 text-signal-risk hover:bg-signal-risk/10",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Card: FC<{ children: ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`rounded-lg border border-line bg-surface shadow-card ${className}`}>{children}</div>
);
