import React from "react";

export interface CalibrationScaleProps {
  label: string;
  value: number | null; // 0-100, or null when evidence is insufficient
  target?: number; // 0-100, optional threshold notch
  tone?: "accent" | "calibrated" | "attention" | "regressed";
  sampleSize?: number;
  dense?: boolean;
}

const TONE_CLASSES: Record<NonNullable<CalibrationScaleProps["tone"]>, string> = {
  accent: "bg-accent",
  calibrated: "bg-calibrated",
  attention: "bg-attention",
  regressed: "bg-regressed"
};

/**
 * A horizontal calibration scale: tick marks every 10 units, a filled
 * reading, and an optional target notch — the one recurring visual device
 * this frontend uses for every accuracy number, in place of a circular
 * progress ring or a plain percentage badge.
 */
export function CalibrationScale({ label, value, target, tone = "accent", sampleSize, dense = false }: CalibrationScaleProps) {
  const fillClass = TONE_CLASSES[tone];
  const hasEvidence = value != null;

  return (
    <div className={dense ? "py-2" : "py-3"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-soft">{label}</span>
        {hasEvidence ? (
          <span className="font-mono-tabular text-lg font-semibold text-ink">{value.toFixed(1)}%</span>
        ) : (
          <span className="text-sm italic text-ink-soft">insufficient evidence{sampleSize != null ? ` (n=${sampleSize})` : ""}</span>
        )}
      </div>

      <div className="relative mt-1.5 h-2.5 w-full rounded-none bg-paper-raised">
        {/* tick marks every 10% */}
        <div className="absolute inset-0 flex justify-between">
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="h-full w-px bg-rule" />
          ))}
        </div>

        {hasEvidence && (
          <div className={`absolute inset-y-0 left-0 ${fillClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        )}

        {target != null && (
          <div
            className="absolute -top-1 h-[calc(100%+8px)] w-[2px] bg-ink"
            style={{ left: `${Math.max(0, Math.min(100, target))}%` }}
            title={`Target: ${target}%`}
          />
        )}
      </div>
    </div>
  );
}
