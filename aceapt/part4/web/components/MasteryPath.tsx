import React, { useMemo, useState } from "react";
import type { PathNodeView, PathVersionView } from "./types";

/**
 * Design intent: the product is literally called a "path" — so instead of a
 * generic progress bar or kanban row, the path is drawn as a real route
 * profile: waypoints rising left-to-right along a trail, the way a hiking
 * map shows elevation. Height along the trail has no numeric meaning (it's
 * not mapped to difficulty or score) — it exists purely so the sequence
 * reads as a journey rather than a checklist. Status is what actually
 * carries information, via marker fill/ring, not position.
 *
 * Palette (scoped to .aceapt-mastery-path, safe to drop next to Tailwind or
 * plain CSS): slate-ink ground, brass for verified/earned, steel-blue for
 * the current waypoint, muted amber for a freshness check due.
 */

const MAX_VISIBLE_NODES = 7;

const STATUS_META: Record<PathNodeView["status"], { label: string; color: string }> = {
  VERIFIED: { label: "Verified", color: "var(--amp-brass)" },
  IN_PROGRESS: { label: "In progress", color: "var(--amp-steel)" },
  REVIEW_DUE: { label: "Review due", color: "var(--amp-amber)" },
  UPCOMING: { label: "Upcoming", color: "var(--amp-muted)" },
  DEFERRED: { label: "Deferred", color: "var(--amp-dim)" },
};

function buildTrail(count: number, width: number, height: number) {
  const marginX = 46;
  const baseY = height - 46;
  const riseStep = count > 1 ? Math.min(34, (height - 90) / (count - 1)) : 0;
  const points = Array.from({ length: count }, (_, i) => {
    const x = count === 1 ? width / 2 : marginX + (i * (width - marginX * 2)) / (count - 1);
    const wobble = Math.sin(i * 1.7) * 7;
    const y = baseY - i * riseStep + wobble;
    return { x, y };
  });

  let d = "";
  points.forEach((p, i) => {
    if (i === 0) {
      d += `M ${p.x} ${p.y}`;
    } else {
      const prev = points[i - 1];
      const midX = (prev.x + p.x) / 2;
      d += ` C ${midX} ${prev.y}, ${midX} ${p.y}, ${p.x} ${p.y}`;
    }
  });

  return { points, d };
}

export interface MasteryPathProps {
  path: PathVersionView;
  onSelectNode?: (skillId: string) => void;
}

export default function MasteryPath({ path, onSelectNode }: MasteryPathProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const visible = path.nodes.slice(0, MAX_VISIBLE_NODES);
  const overflow = path.nodes.length - visible.length;

  const width = 840;
  const height = 220;
  const trail = useMemo(() => buildTrail(Math.max(visible.length, 1), width, height), [visible.length]);

  return (
    <div className="aceapt-mastery-path">
      <style>{`
        .aceapt-mastery-path {
          --amp-bg: #14181f;
          --amp-surface: #1c232e;
          --amp-brass: #c9a15a;
          --amp-steel: #5fa8d3;
          --amp-amber: #d99a4e;
          --amp-muted: #5b6472;
          --amp-dim: #3a414c;
          --amp-text: #edeff2;
          --amp-text-muted: #8b93a1;
          background: var(--amp-bg);
          color: var(--amp-text);
          border-radius: 16px;
          padding: 22px 24px 18px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .aceapt-mastery-path .amp-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .aceapt-mastery-path h3 { margin: 0; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
        .aceapt-mastery-path .amp-version { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; color: var(--amp-text-muted); }
        .aceapt-mastery-path .amp-reason { margin: 6px 0 4px; font-size: 13px; color: var(--amp-text-muted); }
        .aceapt-mastery-path .amp-tradeoff { margin: 10px 0 0; padding: 9px 12px; background: rgba(217, 154, 78, 0.12); border: 1px solid rgba(217, 154, 78, 0.35); border-radius: 8px; font-size: 12.5px; color: #e8c088; }
        .aceapt-mastery-path svg { display: block; width: 100%; height: auto; margin-top: 10px; }
        .aceapt-mastery-path .amp-node-btn { cursor: pointer; }
        .aceapt-mastery-path .amp-node-label { font-size: 11.5px; fill: var(--amp-text); font-weight: 500; }
        .aceapt-mastery-path .amp-node-sub { font-size: 9.5px; fill: var(--amp-text-muted); font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .aceapt-mastery-path .amp-overflow { margin-top: 4px; font-size: 12px; color: var(--amp-text-muted); }
        .aceapt-mastery-path .amp-legend { display: flex; gap: 16px; margin-top: 14px; flex-wrap: wrap; }
        .aceapt-mastery-path .amp-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--amp-text-muted); }
        .aceapt-mastery-path .amp-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
      `}</style>

      <div className="amp-header">
        <h3>Your Mastery Path</h3>
        <span className="amp-version">v{path.versionNumber}</span>
      </div>
      <p className="amp-reason">{path.reason}</p>
      {path.tradeoffMessage && <div className="amp-tradeoff">{path.tradeoffMessage}</div>}

      {visible.length > 0 ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mastery path visualized as a route">
          <path d={trail.d} fill="none" stroke="var(--amp-dim)" strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" />
          {trail.points.map((p, i) => {
            const node = visible[i];
            const meta = STATUS_META[node.status];
            const isHovered = hovered === node.skillId;
            const radius = node.order === 0 ? 11 : 8;
            return (
              <g
                key={node.skillId}
                className="amp-node-btn"
                onMouseEnter={() => setHovered(node.skillId)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectNode?.(node.skillId)}
                tabIndex={0}
                role="button"
                aria-label={`${node.skillName}, ${meta.label}, priority ${node.priorityScore.toFixed(2)}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelectNode?.(node.skillId);
                }}
              >
                {node.status === "IN_PROGRESS" && <circle cx={p.x} cy={p.y} r={radius + 6} fill={meta.color} opacity={0.18} />}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={radius}
                  fill={node.status === "UPCOMING" || node.status === "DEFERRED" ? "var(--amp-surface)" : meta.color}
                  stroke={meta.color}
                  strokeWidth={2}
                  opacity={isHovered ? 1 : node.status === "DEFERRED" ? 0.55 : 1}
                />
                {node.status === "VERIFIED" && (
                  <path d={`M ${p.x - 4} ${p.y} l 2.5 3 l 5.5 -6`} stroke="#14181f" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
                <text x={p.x} y={p.y - radius - 20} textAnchor="middle" className="amp-node-label">
                  {node.skillName.length > 20 ? node.skillName.slice(0, 19) + "…" : node.skillName}
                </text>
                <text x={p.x} y={p.y - radius - 8} textAnchor="middle" className="amp-node-sub">
                  {node.action.actionType} · {node.priorityScore.toFixed(2)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="amp-reason">Not enough evidence yet to generate a path.</p>
      )}

      {overflow > 0 && <p className="amp-overflow">+{overflow} more further down your path</p>}

      <div className="amp-legend">
        {(Object.keys(STATUS_META) as PathNodeView["status"][]).map((status) => (
          <span key={status} className="amp-legend-item">
            <span className="amp-legend-dot" style={{ background: STATUS_META[status].color }} />
            {STATUS_META[status].label}
          </span>
        ))}
      </div>
    </div>
  );
}
