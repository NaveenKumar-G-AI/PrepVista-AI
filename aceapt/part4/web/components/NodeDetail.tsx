import React from "react";
import type { PathNodeView, WhyThisView } from "./types";
import WhyThisPanel from "./WhyThisPanel";

export interface NodeDetailProps {
  node: PathNodeView;
  why: WhyThisView;
  onStart?: () => void;
  onSkip?: () => void;
  onPostpone?: () => void;
}

const STATUS_LABEL: Record<PathNodeView["status"], string> = {
  VERIFIED: "Verified",
  IN_PROGRESS: "In progress",
  UPCOMING: "Upcoming",
  DEFERRED: "Deferred",
  REVIEW_DUE: "Review due",
};

export default function NodeDetail({ node, why, onStart, onSkip, onPostpone }: NodeDetailProps) {
  return (
    <div className="aceapt-node-detail">
      <style>{`
        .aceapt-node-detail {
          --nd-bg: #14181f; --nd-text: #edeff2; --nd-muted: #8b93a1; --nd-brass: #c9a15a;
          background: var(--nd-bg); color: var(--nd-text); border-radius: 16px; padding: 22px 24px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 480px;
        }
        .aceapt-node-detail h2 { margin: 0 0 4px; font-family: 'Space Grotesk', 'Inter', sans-serif; font-size: 20px; font-weight: 600; }
        .aceapt-node-detail .nd-meta { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
        .aceapt-node-detail .nd-status { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: rgba(201,161,90,0.15); color: var(--nd-brass); font-weight: 600; letter-spacing: 0.02em; }
        .aceapt-node-detail .nd-minutes { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11.5px; color: var(--nd-muted); }
        .aceapt-node-detail .nd-actions { display: flex; gap: 10px; margin-top: 18px; }
        .aceapt-node-detail button { font-family: inherit; font-size: 13px; border-radius: 8px; padding: 10px 16px; cursor: pointer; border: none; }
        .aceapt-node-detail .nd-primary { background: #5fa8d3; color: #0d1116; font-weight: 600; flex: 1; }
        .aceapt-node-detail .nd-primary:hover { filter: brightness(1.08); }
        .aceapt-node-detail .nd-secondary { background: transparent; color: var(--nd-muted); border: 1px solid #3a414c; }
        .aceapt-node-detail .nd-secondary:hover { color: var(--nd-text); border-color: #5b6472; }
      `}</style>

      <h2>{node.skillName}</h2>
      <div className="nd-meta">
        <span className="nd-status">{STATUS_LABEL[node.status]}</span>
        <span className="nd-minutes">~{node.estimatedMinutes} min</span>
      </div>

      <WhyThisPanel why={why} />

      <div className="nd-actions">
        {onStart && (
          <button className="nd-primary" onClick={onStart}>
            Start
          </button>
        )}
        {onPostpone && (
          <button className="nd-secondary" onClick={onPostpone}>
            Postpone
          </button>
        )}
        {onSkip && (
          <button className="nd-secondary" onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
