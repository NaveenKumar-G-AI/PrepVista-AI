import type { SessionEvidence } from "../engine/analytics.js";

/**
 * Template-based narrative built entirely from the evidence object, with no
 * network call. This is not a lesser "error state" — it's the guaranteed
 * baseline the AI layer enhances, so the report is never empty or broken if
 * ANTHROPIC_API_KEY is unset or the request fails (spec §58 reliability).
 */
export function buildFallbackNarrative(ev: SessionEvidence): string {
  const parts: string[] = [];

  parts.push(
    `You scored ${ev.score} out of ${ev.maxScore}, with ${ev.accuracyPct}% accuracy on the ${ev.attemptRatePct}% of questions you attempted.`
  );

  const first = ev.segments[0]?.accuracyPct;
  const last = ev.segments[ev.segments.length - 1]?.accuracyPct;
  if (first != null) {
    parts.push(`You opened at ${first}% accuracy in the first section.`);
  }
  if (ev.degrading && first != null && last != null) {
    parts.push(`That slipped to ${last}% by the final section — a sign of pacing or fatigue late in the test.`);
  } else if (last != null) {
    parts.push(`Your accuracy held up through to the final section, finishing around ${last}%.`);
  }

  if (ev.overinvested.length > 0) {
    parts.push(
      `${ev.biggestLeak.text} At your average pace of ${Math.round(ev.avgTimePerQuestionSec)}s per question, that's roughly ${ev.opportunityCostEquivalentQuestions} extra questions you could have attempted instead.`
    );
  }

  if (ev.recoveryRatePct != null) {
    parts.push(
      ev.recoveryRatePct >= 50
        ? `You recovered well after tough questions — your next attempt landed correctly ${ev.recoveryRatePct}% of the time.`
        : `After a tough question, your next attempt only landed ${ev.recoveryRatePct}% of the time — worth building steadier recovery habits.`
    );
  }

  parts.push(
    ev.selectionQuality === "Weak"
      ? "Your single biggest lever right now is question selection — deciding faster on what to skip."
      : "Keep building speed while holding onto this level of accuracy."
  );

  return parts.join(" ");
}

export function buildFallbackCoachAnswer(promptKey: string, ev: SessionEvidence): string {
  switch (promptKey) {
    case "time":
      return ev.overinvested.length > 0
        ? `${ev.biggestLeak.text} Specifically, question${ev.overinvested.length > 1 ? "s" : ""} ${ev.overinvested
            .map((p) => p.sequenceIndex + 1)
            .join(" and ")} took the largest share of your time.`
        : "No single question dominated your time — your pacing stayed fairly even across the test.";
    case "skip":
      return ev.overinvested.length > 0
        ? `Question${ev.overinvested.length > 1 ? "s" : ""} ${ev.overinvested
            .map((p) => p.sequenceIndex + 1)
            .join(" and ")} each took well above your average pace of ${Math.round(
            ev.avgTimePerQuestionSec
          )}s per question. Skipping earlier and returning later would have protected your time budget.`
        : "Your time allocation was already reasonably efficient — no question stands out as a clear should-have-skipped case.";
    case "drop": {
      const first = ev.segments[0]?.accuracyPct;
      const last = ev.segments[ev.segments.length - 1]?.accuracyPct;
      return ev.degrading && first != null && last != null
        ? `Your accuracy fell from ${first}% in the opening section to ${last}% by the end — that stretch is where to focus next.`
        : "Your accuracy stayed fairly consistent across the test — no clear drop-off point.";
    }
    case "analyze":
    default:
      return buildFallbackNarrative(ev);
  }
}
