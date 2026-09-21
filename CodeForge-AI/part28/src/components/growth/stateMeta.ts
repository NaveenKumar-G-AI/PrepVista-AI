import type { GrowthState, TrendDirection } from "../../lib/growth/types.ts";

export interface StateMeta {
  label: string;
  colorVar: string;
  softVar: string;
  glyph: string; // a plain character glyph, not an icon font — keeps this file dependency-free
}

const STATE_META: Record<GrowthState, StateMeta> = {
  NO_EVIDENCE: { label: "No evidence yet", colorVar: "var(--gt-state-neutral)", softVar: "var(--gt-state-neutral-soft)", glyph: "·" },
  INSUFFICIENT_EVIDENCE: { label: "Not enough evidence yet", colorVar: "var(--gt-state-neutral)", softVar: "var(--gt-state-neutral-soft)", glyph: "·" },
  EMERGING: { label: "Emerging", colorVar: "var(--gt-state-stable)", softVar: "var(--gt-state-stable-soft)", glyph: "◦" },
  IMPROVING: { label: "Improving", colorVar: "var(--gt-state-improving)", softVar: "var(--gt-state-improving-soft)", glyph: "↑" },
  STABLE: { label: "Stable", colorVar: "var(--gt-state-stable)", softVar: "var(--gt-state-stable-soft)", glyph: "→" },
  STRONG: { label: "Strong", colorVar: "var(--gt-state-improving)", softVar: "var(--gt-state-improving-soft)", glyph: "↑" },
  MASTERED: { label: "Mastered", colorVar: "var(--gt-state-improving)", softVar: "var(--gt-state-improving-soft)", glyph: "★" },
  STAGNATING: { label: "Stagnating", colorVar: "var(--gt-state-stagnating)", softVar: "var(--gt-state-stagnating-soft)", glyph: "≈" },
  AT_RISK: { label: "At risk", colorVar: "var(--gt-state-stagnating)", softVar: "var(--gt-state-stagnating-soft)", glyph: "!" },
  REGRESSING: { label: "Regressing", colorVar: "var(--gt-state-regressing)", softVar: "var(--gt-state-regressing-soft)", glyph: "↓" },
  RECOVERING: { label: "Recovering", colorVar: "var(--gt-state-improving)", softVar: "var(--gt-state-improving-soft)", glyph: "↗" },
};

export function stateMeta(state: GrowthState): StateMeta {
  return STATE_META[state];
}

export function trendGlyph(trend: TrendDirection): string {
  switch (trend) {
    case "POSITIVE":
      return "↑";
    case "NEGATIVE":
      return "↓";
    case "FLAT":
      return "→";
    case "UNKNOWN":
      return "·";
  }
}
