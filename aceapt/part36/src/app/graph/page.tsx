"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";

interface GraphNode {
  id: string;
  label: string;
  layer: number;
  kind: "goal" | "milestone" | "capability" | "opportunity" | "outcome";
  isBottleneck?: boolean;
  isUnknown?: boolean;
}
interface GraphEdge {
  from: string;
  to: string;
}
interface GraphResponse {
  hasGoal: boolean;
  graph?: { nodes: GraphNode[]; edges: GraphEdge[] };
}

const LAYER_HEIGHT = 140;
const TOP_PADDING = 60;
const BOX_W = 168;
const BOX_H = 56;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function toneFor(node: GraphNode): { stroke: string; fill: string; text: string } {
  if (node.isUnknown) return { stroke: "var(--color-hairline-strong)", fill: "var(--color-surface)", text: "var(--color-ink-faint)" };
  if (node.isBottleneck) return { stroke: "var(--color-rust)", fill: "var(--color-rust-soft)", text: "var(--color-rust)" };
  switch (node.kind) {
    case "goal":
      return { stroke: "var(--color-ink)", fill: "var(--color-ink)", text: "#ffffff" };
    case "milestone":
      return { stroke: "var(--color-brass)", fill: "var(--color-brass-soft)", text: "var(--color-brass-strong)" };
    case "capability":
      return { stroke: "var(--color-sage)", fill: "var(--color-sage-soft)", text: "var(--color-sage)" };
    case "opportunity":
      return { stroke: "var(--color-slate)", fill: "var(--color-slate-soft)", text: "var(--color-slate)" };
    case "outcome":
      return { stroke: "var(--color-hairline-strong)", fill: "var(--color-surface)", text: "var(--color-ink)" };
  }
}

export default function GraphPage() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<GraphResponse>("/api/career/execution/graph")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-16 text-center text-sm text-ink-muted">Loading…</p>;
  if (!data?.hasGoal || !data.graph) return <EmptyState title="No plan yet" description="Set a career goal on the Today screen first." />;

  const { nodes, edges } = data.graph;
  const maxLayer = Math.max(...nodes.map((n) => n.layer));
  const width = 900;
  const height = TOP_PADDING + (maxLayer + 1) * LAYER_HEIGHT;

  const positions = new Map<string, { x: number; y: number }>();
  for (let layer = 0; layer <= maxLayer; layer++) {
    const layerNodes = nodes.filter((n) => n.layer === layer);
    layerNodes.forEach((n, i) => {
      const x = (width * (i + 1)) / (layerNodes.length + 1);
      const y = TOP_PADDING + layer * LAYER_HEIGHT;
      positions.set(n.id, { x, y });
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-2xl font-semibold text-ink">Career action graph</p>
        <p className="mt-1 text-sm text-ink-muted">Why each action exists — how it connects up to your goal.</p>
      </div>

      <Panel className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 640 }} role="img" aria-label="Career action graph">
          {edges.map((e, i) => {
            const from = positions.get(e.from);
            const to = positions.get(e.to);
            if (!from || !to) return null;
            const midY = (from.y + BOX_H / 2 + to.y - BOX_H / 2) / 2;
            return (
              <path
                key={i}
                d={`M ${from.x} ${from.y + BOX_H / 2} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y - BOX_H / 2}`}
                fill="none"
                stroke="var(--color-hairline-strong)"
                strokeWidth={1.5}
              />
            );
          })}

          {nodes.map((n) => {
            const pos = positions.get(n.id);
            if (!pos) return null;
            const tone = toneFor(n);
            return (
              <g key={n.id} transform={`translate(${pos.x - BOX_W / 2}, ${pos.y - BOX_H / 2})`}>
                <rect
                  width={BOX_W}
                  height={BOX_H}
                  rx={2}
                  fill={tone.fill}
                  stroke={tone.stroke}
                  strokeWidth={n.kind === "goal" ? 0 : 1.5}
                  strokeDasharray={n.isUnknown ? "4 3" : undefined}
                />
                <text x={BOX_W / 2} y={BOX_H / 2 + 4} textAnchor="middle" fontSize={12.5} fontFamily="var(--font-sans)" fill={tone.text}>
                  {truncate(n.label, 22)}
                </text>
              </g>
            );
          })}
        </svg>
      </Panel>
    </div>
  );
}
