import type { MasteryStateEnum } from "../api/client";

const STATE_LABEL: Record<MasteryStateEnum, string> = {
  UNKNOWN: "Not started",
  INTRODUCED: "Introduced",
  LEARNING: "Learning",
  PRACTICING: "Practicing",
  IMPROVING: "Improving",
  PROVISIONALLY_MASTERED: "Provisional",
  VERIFIED_MASTERED: "Verified",
  STABLE_MASTERED: "Stable",
  AT_RISK: "At risk",
  REGRESSED: "Regressed",
};

const STATE_TONE: Record<MasteryStateEnum, "verified" | "provisional" | "caution" | "regressed" | "neutral"> = {
  UNKNOWN: "neutral",
  INTRODUCED: "neutral",
  LEARNING: "provisional",
  PRACTICING: "provisional",
  IMPROVING: "provisional",
  PROVISIONALLY_MASTERED: "provisional",
  VERIFIED_MASTERED: "verified",
  STABLE_MASTERED: "verified",
  AT_RISK: "caution",
  REGRESSED: "regressed",
};

const TONE_CLASSES: Record<string, string> = {
  verified: "bg-verified-soft text-verified border-verified/30",
  provisional: "bg-provisional-soft text-provisional border-provisional/30",
  caution: "bg-caution-soft text-caution border-caution/30",
  regressed: "bg-regressed-soft text-regressed border-regressed/30",
  neutral: "bg-line-soft text-ink-soft border-line",
};

export function StateBadge({ state, size = "md" }: { state: MasteryStateEnum; size?: "sm" | "md" }) {
  const tone = STATE_TONE[state];
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${TONE_CLASSES[tone]} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: "LOW" | "MEDIUM" | "HIGH" }) {
  const dotCount = confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint" title={`${confidence} confidence`}>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < dotCount ? "bg-ink-soft" : "bg-line"}`} />
        ))}
      </span>
      <span className="uppercase tracking-wide">{confidence.toLowerCase()} confidence</span>
    </span>
  );
}
