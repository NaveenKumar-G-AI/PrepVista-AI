import type { MasteryStateEnum } from "../api/client";

const MAIN_TRACK: MasteryStateEnum[] = ["INTRODUCED", "LEARNING", "PRACTICING", "IMPROVING", "PROVISIONALLY_MASTERED", "VERIFIED_MASTERED", "STABLE_MASTERED"];
const TRACK_LABELS: Record<string, string> = {
  INTRODUCED: "Introduced",
  LEARNING: "Learning",
  PRACTICING: "Practicing",
  IMPROVING: "Improving",
  PROVISIONALLY_MASTERED: "Provisional",
  VERIFIED_MASTERED: "Verified",
  STABLE_MASTERED: "Stable",
};

/**
 * Spec section 6: "Do not immediately promote a skill from practice to
 * stable mastery." This renders the actual state machine as a line the
 * student's position sits on, so the point is visible rather than asserted
 * in a sentence. AT_RISK/REGRESSED are branch states off this main line
 * (a skill regresses FROM a point on the track, it doesn't have its own
 * permanent slot on it), shown instead as a marker pulled below the line.
 */
export function StateTrack({ state }: { state: MasteryStateEnum }) {
  const isBranch = state === "AT_RISK" || state === "REGRESSED";
  const effectiveIndex = isBranch ? MAIN_TRACK.indexOf("VERIFIED_MASTERED") : state === "UNKNOWN" ? -1 : MAIN_TRACK.indexOf(state);

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        <div className="absolute left-0 right-0 h-px bg-line" style={{ top: "5px" }} />
        {MAIN_TRACK.map((step, i) => {
          const reached = effectiveIndex >= i;
          const isCurrent = !isBranch && i === effectiveIndex;
          return (
            <div key={step} className="relative flex-1 flex flex-col items-start first:items-start">
              <div
                className={`h-[11px] w-[11px] rounded-full border-2 z-10 ${
                  isCurrent
                    ? "bg-verified border-verified"
                    : reached
                      ? "bg-ink border-ink"
                      : "bg-paper border-line"
                }`}
              />
              <span className={`mt-2 text-[10px] uppercase tracking-wide ${reached ? "text-ink-soft" : "text-ink-faint"}`}>
                {TRACK_LABELS[step]}
              </span>
            </div>
          );
        })}
      </div>
      {isBranch && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${state === "AT_RISK" ? "bg-caution" : "bg-regressed"}`} />
          <span className={state === "AT_RISK" ? "text-caution" : "text-regressed"}>
            {state === "AT_RISK" ? "Dropped from verified - at risk" : "Regressed from a previously verified level"}
          </span>
        </div>
      )}
    </div>
  );
}
