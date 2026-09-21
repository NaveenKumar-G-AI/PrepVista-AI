import type { BottleneckType, TopicCapabilityState } from "../types";

/**
 * Picks the 1-2 numbers most relevant to *this* bottleneck for the evidence
 * readout's metric row - e.g. transfer gaps contrast mastery vs transfer,
 * retention gaps contrast mastery vs retention. Keeps the readout focused
 * on the number that actually explains the recommendation instead of
 * dumping every metric on every card.
 */
export function metricsForBottleneck(
  bottleneck: BottleneckType,
  state: TopicCapabilityState | undefined
): { label: string; value: string }[] {
  if (!state) return [];
  const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

  switch (bottleneck) {
    case "TRANSFER_GAP":
      return [
        { label: "MASTERY", value: pct(state.mastery) },
        { label: "TRANSFER", value: pct(state.transfer) }
      ];
    case "RETENTION_DECAY":
      return [
        { label: "MASTERY", value: pct(state.mastery) },
        { label: "RETENTION", value: pct(state.retention) }
      ];
    case "SPEED_LIMIT":
      return [
        { label: "ACCURACY", value: pct(state.accuracy) },
        { label: "SPEED", value: pct(state.speed) }
      ];
    case "METHOD_ERROR":
      return [{ label: "PATTERN", value: state.persistentErrorPattern ?? "–" }];
    case "CONCEPT_GAP":
    case "PREREQUISITE_GAP":
      return [{ label: "MASTERY", value: pct(state.mastery) }];
    case "LOW_EVIDENCE":
      return [{ label: "ATTEMPTS", value: `${state.sampleSize}` }];
    case "STABLE":
      return [
        { label: "MASTERY", value: pct(state.mastery) },
        { label: "RETENTION", value: pct(state.retention) },
        { label: "TRANSFER", value: pct(state.transfer) }
      ];
    default:
      return [];
  }
}
