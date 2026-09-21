import React from "react";
import type { CapabilitySnapshot, DimensionLabel } from "./types.js";

const DIMENSION_ORDER: (keyof CapabilitySnapshot["dimensions"])[] = [
  "mastery",
  "retention",
  "transfer",
  "accuracy",
  "speed",
  "consistency",
];

const DIMENSION_NAMES: Record<string, string> = {
  mastery: "Mastery",
  retention: "Retention",
  transfer: "Transfer",
  accuracy: "Accuracy",
  speed: "Speed",
  consistency: "Consistency",
};

const LABEL_META: Record<DimensionLabel, { text: string; dotClass: string }> = {
  STRONG: { text: "Strong", dotClass: "af-dot--strong" },
  MODERATE: { text: "Moderate", dotClass: "af-dot--moderate" },
  NEEDS_ATTENTION: { text: "Needs attention", dotClass: "af-dot--needs-attention" },
  INSUFFICIENT_DATA: { text: "Not enough data", dotClass: "af-dot--insufficient" },
};

export function ReadinessProfile({ capability }: { capability: CapabilitySnapshot }) {
  const rows = DIMENSION_ORDER.map((key) => capability.dimensions[key]).filter((d): d is NonNullable<typeof d> => d != null);

  if (rows.length === 0) {
    return (
      <div className="af-panel">
        <p className="af-panel__title">Readiness profile</p>
        <p className="af-empty">No capability evidence yet.</p>
      </div>
    );
  }

  return (
    <div className="af-panel">
      <p className="af-panel__title">Readiness profile</p>
      {rows.map((dim) => {
        const label = LABEL_META[dim.label];
        return (
          <div className="af-profile-row" key={dim.key}>
            <span className="af-profile-row__name">
              <span className={`af-dot ${label.dotClass}`} aria-hidden="true" />
              {DIMENSION_NAMES[dim.key]}
            </span>
            <span className="af-profile-row__value">
              {dim.label !== "INSUFFICIENT_DATA" && <span>{Math.round(dim.value)}%</span>}
              <span className="af-profile-row__label">{label.text}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
