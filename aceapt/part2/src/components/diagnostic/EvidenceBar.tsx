import type { EvidenceLevel } from "@/lib/domain/types";

/*
  The signature element: capability isn't a percentage here, it's a
  position on a 7-step evidence ladder, with "verified" as a separate
  overlay mark rather than an 8th rung — a follow-up check can confirm a
  DEVELOPING reading just as validly as an ADVANCED one, so it's modeled as
  a property of the reading, not a level beyond it. This is deliberately
  the only place in the UI that uses the brass accent this densely; it's
  meant to be the thing this page is remembered by.
*/

const LADDER: EvidenceLevel[] = [
  "NOT_ASSESSED",
  "LIMITED_EVIDENCE",
  "EMERGING",
  "DEVELOPING",
  "FUNCTIONAL",
  "STRONG",
  "ADVANCED",
];

const LABEL: Record<EvidenceLevel, string> = {
  NOT_ASSESSED: "Not assessed",
  LIMITED_EVIDENCE: "Limited evidence",
  EMERGING: "Emerging",
  DEVELOPING: "Developing",
  FUNCTIONAL: "Functional",
  STRONG: "Strong",
  ADVANCED: "Advanced",
  VERIFIED: "Verified",
};

export function EvidenceBar({
  level,
  verified = false,
  attempts,
  size = "md",
}: {
  level: EvidenceLevel;
  verified?: boolean;
  attempts?: number;
  size?: "sm" | "md";
}) {
  const rank = Math.max(0, LADDER.indexOf(level));
  const segHeight = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={`Evidence level: ${LABEL[level]}${verified ? ", verified" : ""}`}>
      <div className="flex items-center gap-2">
        <div className="flex gap-[3px]" aria-hidden="true">
          {LADDER.map((_, i) => (
            <span
              key={i}
              className={`${segHeight} w-4 rounded-[2px] ${i <= rank && rank > 0 ? "bg-brass" : "bg-steel-soft"}`}
            />
          ))}
        </div>
        {verified && (
          <span className="text-brass-strong text-xs font-mono" title="Confirmed on a follow-up check">
            ✓ verified
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 font-mono text-xs text-ink-soft">
        <span>{LABEL[level]}</span>
        {typeof attempts === "number" && attempts > 0 && <span className="text-ink-faint">· {attempts} asked</span>}
      </div>
    </div>
  );
}
