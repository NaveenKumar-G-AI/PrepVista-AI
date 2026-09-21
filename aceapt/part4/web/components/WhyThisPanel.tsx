import React from "react";
import type { WhyThisView } from "./types";

export interface WhyThisPanelProps {
  why: WhyThisView;
}

const ROWS: { key: keyof WhyThisView; label: string }[] = [
  { key: "what", label: "WHAT" },
  { key: "why", label: "WHY" },
  { key: "evidence", label: "EVIDENCE" },
  { key: "impact", label: "IMPACT" },
  { key: "next", label: "NEXT" },
];

export default function WhyThisPanel({ why }: WhyThisPanelProps) {
  return (
    <div className="aceapt-why-panel">
      <style>{`
        .aceapt-why-panel {
          --wp-bg: #1c232e; --wp-text: #edeff2; --wp-muted: #8b93a1; --wp-brass: #c9a15a;
          background: var(--wp-bg); color: var(--wp-text); border-radius: 14px; padding: 18px 20px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .aceapt-why-panel .wp-row { display: grid; grid-template-columns: 84px 1fr; gap: 12px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,0.06); }
        .aceapt-why-panel .wp-row:first-child { border-top: none; }
        .aceapt-why-panel .wp-label { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10.5px; letter-spacing: 0.06em; color: var(--wp-brass); padding-top: 2px; }
        .aceapt-why-panel .wp-value { font-size: 13.5px; line-height: 1.5; color: var(--wp-text); }
      `}</style>
      {ROWS.map((row) => (
        <div className="wp-row" key={row.key}>
          <span className="wp-label">{row.label}</span>
          <span className="wp-value">{why[row.key]}</span>
        </div>
      ))}
    </div>
  );
}
