"use client";

import { ServiceHealth, ServiceNode } from "@/lib/engine/types";

const HEALTH_COLOR: Record<ServiceHealth, string> = {
  HEALTHY: "#3DD68C",
  DEGRADED: "#E8B93F",
  FAILING: "#F0475A",
  UNKNOWN: "#5C6478",
};

function computeLayers(services: ServiceNode[]): Map<string, number> {
  const byKey = new Map(services.map((s) => [s.key, s]));
  const memo = new Map<string, number>();

  function depth(key: string, seen: Set<string> = new Set()): number {
    if (memo.has(key)) return memo.get(key)!;
    if (seen.has(key)) return 0; // guard against an authoring cycle
    const node = byKey.get(key);
    if (!node || node.dependsOn.length === 0) {
      memo.set(key, 0);
      return 0;
    }
    const d = 1 + Math.max(...node.dependsOn.map((dep) => depth(dep, new Set(seen).add(key))));
    memo.set(key, d);
    return d;
  }

  services.forEach((s) => depth(s.key));
  const maxDepth = Math.max(0, ...Array.from(memo.values()));
  const layers = new Map<string, number>();
  services.forEach((s) => layers.set(s.key, maxDepth - (memo.get(s.key) ?? 0)));
  return layers;
}

export function ServiceGraph({ services, health }: { services: ServiceNode[]; health: Record<string, ServiceHealth> }) {
  const layers = computeLayers(services);
  const maxLayer = Math.max(0, ...Array.from(layers.values()));
  const byLayer = new Map<number, ServiceNode[]>();
  services.forEach((s) => {
    const l = layers.get(s.key) ?? 0;
    byLayer.set(l, [...(byLayer.get(l) ?? []), s]);
  });

  const colWidth = 170;
  const rowHeight = 70;
  const nodeW = 140;
  const nodeH = 44;
  const maxRows = Math.max(1, ...Array.from(byLayer.values()).map((arr) => arr.length));
  const width = (maxLayer + 1) * colWidth + 40;
  const height = maxRows * rowHeight + 40;

  const positions = new Map<string, { x: number; y: number }>();
  byLayer.forEach((nodes, layer) => {
    nodes.forEach((n, i) => {
      const yOffset = (height - nodes.length * rowHeight) / 2;
      positions.set(n.key, { x: 20 + layer * colWidth, y: yOffset + i * rowHeight + rowHeight / 2 - nodeH / 2 });
    });
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minHeight: Math.min(height, 260) }}>
      {services.map((s) =>
        s.dependsOn.map((depKey) => {
          const from = positions.get(s.key);
          const to = positions.get(depKey);
          if (!from || !to) return null;
          const x1 = from.x + nodeW;
          const y1 = from.y + nodeH / 2;
          const x2 = to.x;
          const y2 = to.y + nodeH / 2;
          const depHealth = health[depKey] ?? "UNKNOWN";
          return (
            <line
              key={`${s.key}-${depKey}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={depHealth === "FAILING" ? HEALTH_COLOR.FAILING : "#323a4a"}
              strokeWidth={depHealth === "FAILING" ? 2 : 1.5}
              markerEnd="url(#arrow)"
            />
          );
        })
      )}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#323a4a" />
        </marker>
      </defs>
      {services.map((s) => {
        const pos = positions.get(s.key)!;
        const h = health[s.key] ?? "UNKNOWN";
        return (
          <g key={s.key} transform={`translate(${pos.x}, ${pos.y})`}>
            <rect width={nodeW} height={nodeH} rx={8} fill="#171C27" stroke={HEALTH_COLOR[h]} strokeWidth={1.5} />
            <circle cx={14} cy={nodeH / 2} r={4} fill={HEALTH_COLOR[h]} />
            <text x={26} y={nodeH / 2 - 3} fill="#E7EAF2" fontSize={11} fontWeight={600} fontFamily="IBM Plex Sans, sans-serif">
              {s.name.length > 18 ? s.name.slice(0, 17) + "…" : s.name}
            </text>
            <text x={26} y={nodeH / 2 + 12} fill="#8B93A8" fontSize={9} fontFamily="IBM Plex Mono, monospace">
              {s.kind}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
