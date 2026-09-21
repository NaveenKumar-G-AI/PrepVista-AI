import React from "react";
import type { EvidenceState } from "../src/domain/types";

const ZONES: { state: EvidenceState; color: string; bg: string; label: string }[] = [
  { state: "UNASSESSED", color: "var(--cf-unassessed)", bg: "var(--cf-unassessed-bg)", label: "Not yet assessed" },
  { state: "UNCERTAIN", color: "var(--cf-uncertain)", bg: "var(--cf-uncertain-bg)", label: "Uncertain" },
  { state: "PARTIALLY_VERIFIED", color: "var(--cf-uncertain)", bg: "var(--cf-uncertain-bg)", label: "Partially verified" },
  { state: "VERIFIED", color: "var(--cf-verified)", bg: "var(--cf-verified-bg)", label: "Verified" },
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export interface EvidenceGaugeProps {
  state: EvidenceState;
  skill: string;
  size?: number;
}

/** A 180° instrument split into four 45° zones. The needle snaps to the center of exactly one zone — there is no code path that produces an in-between angle. */
export function EvidenceGauge({ state, skill, size = 108 }: EvidenceGaugeProps) {
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = size / 2 - 14;
  const zoneIndex = ZONES.findIndex((z) => z.state === state);
  const needleAngle = zoneIndex * 45 + 22.5; // center of its zone, always

  const tip = polarToCartesian(cx, cy, r - 10, needleAngle);
  const active = ZONES[zoneIndex]!;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: "var(--cf-font-body)" }}>
      <svg width={size} height={size / 2 + 22} viewBox={`0 0 ${size} ${size / 2 + 22}`} role="img" aria-label={`${skill}: ${active.label}`}>
        {ZONES.map((zone, i) => (
          <path
            key={zone.state}
            d={describeArc(cx, cy, r, i * 45, i * 45 + 45)}
            fill="none"
            stroke={zone.state === state ? zone.color : "var(--cf-line)"}
            strokeWidth={zone.state === state ? 10 : 8}
            strokeLinecap="butt"
          />
        ))}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="var(--cf-ink)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="var(--cf-ink)" />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--cf-font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--cf-ink-muted)", textTransform: "uppercase" }}>
          {skill}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: active.color }}>{active.label}</div>
      </div>
    </div>
  );
}
