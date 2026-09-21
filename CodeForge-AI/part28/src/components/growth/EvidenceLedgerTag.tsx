import React from "react";
import type { ConfidenceLevel } from "../../lib/growth/types.ts";

export interface EvidenceTick {
  evidenceId: string;
  outcome: "SUCCESS" | "PARTIAL" | "FAILURE";
}

interface EvidenceLedgerTagProps {
  evidenceCount: number;
  confidence: ConfidenceLevel;
  ticks?: EvidenceTick[];
  onOpen?: () => void;
}

const TICK_COLOR: Record<EvidenceTick["outcome"], string> = {
  SUCCESS: "var(--gt-state-improving)",
  PARTIAL: "var(--gt-state-stagnating)",
  FAILURE: "var(--gt-state-regressing)",
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  HIGH: "high confidence",
  MEDIUM: "medium confidence",
  LOW: "low confidence",
  INSUFFICIENT: "not enough evidence for confidence",
};

/**
 * Deliberately NOT a sparkline. Sparklines imply a continuous, smoothly
 * interpolated quantity; growth evidence is a handful of discrete
 * demonstrations, and drawing a smooth curve through them fabricates
 * precision the underlying data doesn't have (see spec: "avoid fake smooth
 * lines... exaggerated axes... charts implying certainty where evidence is
 * sparse"). Each tick here is one real, clickable evidence point.
 */
export function EvidenceLedgerTag({ evidenceCount, confidence, ticks, onOpen }: EvidenceLedgerTagProps) {
  const isInteractive = Boolean(onOpen);
  const Component = isInteractive ? "button" : "div";

  return (
    <Component
      className="gt-focus-visible"
      onClick={onOpen}
      type={isInteractive ? "button" : undefined}
      aria-label={
        isInteractive
          ? `View evidence: ${evidenceCount} demonstration${evidenceCount === 1 ? "" : "s"}, ${CONFIDENCE_LABEL[confidence]}`
          : undefined
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        borderRadius: "var(--gt-radius-sm)",
        border: "1px solid var(--gt-border)",
        background: "var(--gt-surface)",
        cursor: isInteractive ? "pointer" : "default",
        font: "inherit",
        color: "inherit",
      }}
    >
      <span className="gt-mono" style={{ fontSize: 12, color: "var(--gt-text-secondary)" }}>
        {evidenceCount} evd
      </span>
      {ticks && ticks.length > 0 && (
        <span style={{ display: "inline-flex", gap: 3 }} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t.evidenceId}
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: TICK_COLOR[t.outcome],
                display: "inline-block",
              }}
            />
          ))}
        </span>
      )}
      <span
        className="gt-mono"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color:
            confidence === "HIGH"
              ? "var(--gt-state-improving)"
              : confidence === "MEDIUM"
                ? "var(--gt-accent)"
                : "var(--gt-text-tertiary)",
        }}
      >
        {confidence.toLowerCase()}
      </span>
    </Component>
  );
}
