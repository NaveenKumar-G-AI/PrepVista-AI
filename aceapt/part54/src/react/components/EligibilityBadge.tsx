const palette = {
  pass: "#1F7A5C",
  fail: "#A6303E",
  neutral: "#6B6558",
  sans: 'ui-sans-serif, "Inter", system-ui, sans-serif'
};

export interface EligibilityBadgeProps {
  mode: "practice" | "timed" | "assessment";
  eligible: boolean;
  /** When the underlying run is stale, show that distinctly rather than a flat "no". */
  stale?: boolean;
}

const MODE_LABEL: Record<EligibilityBadgeProps["mode"], string> = {
  practice: "Practice",
  timed: "Timed challenge",
  assessment: "Assessment"
};

export default function EligibilityBadge({ mode, eligible, stale }: EligibilityBadgeProps) {
  const color = stale ? palette.neutral : eligible ? palette.pass : palette.fail;
  const label = stale ? "Re-checking" : eligible ? "Eligible" : "Not eligible";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: palette.sans,
        fontSize: 12,
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: "3px 10px"
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: "inline-block" }} />
      {MODE_LABEL[mode]} — {label}
    </span>
  );
}
