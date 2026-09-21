export interface AdaptSessionRef {
  sessionId: string;
  capabilityCode: string;
  mode: "PRACTICE" | "TIMED" | "TRANSFER";
  url: string;
}

/**
 * Stand-in for ACEAPT's ADAPT feature. Section 36 is explicit about the
 * boundary: "PATH determines WHAT should happen next. ADAPT determines HOW
 * training/practice should happen... PATH can trigger ADAPT. Do not
 * duplicate adaptive learning logic." This client is the trigger, nothing
 * more -- it does not decide difficulty, question selection, or pacing;
 * it just hands ADAPT a capability and an intent and gets back a session
 * to hand the student. Swap for a real call to ADAPT_SERVICE_URL.
 */
export async function triggerAdaptSession(
  capabilityCode: string,
  actionType: "LEARN" | "PRACTICE" | "REVISE" | "RETEST" | "TRANSFER" | "SIMULATE"
): Promise<AdaptSessionRef> {
  const mode = actionType === "TRANSFER" ? "TRANSFER" : actionType === "PRACTICE" || actionType === "SIMULATE" ? "TIMED" : "PRACTICE";
  const sessionId = `adapt_${capabilityCode}_${Date.now()}`;
  return {
    sessionId,
    capabilityCode,
    mode,
    url: `/adapt/session/${sessionId}`,
  };
}
