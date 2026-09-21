// Deterministic gap calculation (Section 20). No LLM involved - this is
// pure arithmetic over real numbers, or an honest "unknown"/"unsupported"
// when the data to compute something doesn't exist yet.
import type {
  CapabilityDimension,
  CapabilitySnapshot,
  DimensionalGap,
  GapSize,
  SpeedBand,
} from "../domain/types.js";

const SPEED_RANK: Record<SpeedBand, number> = {
  SLOW: 0,
  DEVELOPING: 1,
  ON_PACE: 2,
  FAST: 3,
};

function classify(gap: number | null): GapSize["classification"] {
  if (gap === null) return "UNKNOWN";
  if (gap <= 0) return "NONE";
  if (gap <= 10) return "SMALL";
  if (gap <= 25) return "MODERATE";
  return "LARGE";
}

export interface GapEngineInput {
  current: CapabilitySnapshot;
  targetCapability: Partial<Record<CapabilityDimension, number>>;
  targetAccuracy: number | null;
  targetSpeedBand: SpeedBand | null;
  /** Optional configured consistency benchmark. Absent unless the goal's
   * metadata explicitly sets one - Feature 44 does not infer this on its
   * own (Section 69: nothing displayed without a traceable source). */
  targetConsistency?: number | null;
}

export function computeGap(input: GapEngineInput): DimensionalGap {
  const { current, targetCapability, targetAccuracy, targetSpeedBand } = input;

  const dimensions = new Set<CapabilityDimension>([
    ...(Object.keys(current.scores) as CapabilityDimension[]),
    ...(Object.keys(targetCapability) as CapabilityDimension[]),
  ]);

  const capability: GapSize[] = [...dimensions].map((dimension) => {
    const currentValue = current.scores[dimension] ?? null;
    const targetValue = targetCapability[dimension] ?? null;
    const gap =
      currentValue !== null && targetValue !== null
        ? Math.max(0, round2(targetValue - currentValue))
        : null;
    return {
      dimension,
      current: currentValue,
      target: targetValue,
      gap,
      classification: classify(gap),
    };
  });
  capability.sort((a, b) => a.dimension.localeCompare(b.dimension));

  const accuracyGap =
    targetAccuracy === null
      ? null
      : {
          current: current.accuracy ?? null,
          target: targetAccuracy,
          gap:
            current.accuracy !== undefined
              ? Math.max(0, round2(targetAccuracy - current.accuracy))
              : null,
        };

  const speedGap =
    targetSpeedBand === null
      ? null
      : {
          current: current.speedBand ?? null,
          target: targetSpeedBand,
          met: current.speedBand
            ? SPEED_RANK[current.speedBand] >= SPEED_RANK[targetSpeedBand]
            : null,
        };

  const consistencyGap =
    input.targetConsistency == null
      ? null
      : {
          current: current.consistency ?? null,
          target: input.targetConsistency,
          gap:
            current.consistency !== undefined
              ? Math.max(0, round2(input.targetConsistency - current.consistency))
              : null,
        };

  const unsupported: string[] = [];
  if (input.targetConsistency == null) {
    unsupported.push(
      "consistency_gap: no consistency benchmark configured for this goal"
    );
  }
  unsupported.push(
    "retention_gap: not available - the capability data source does not report retention scores"
  );
  unsupported.push(
    "transfer_gap: not available - the capability data source does not report cross-topic transfer scores"
  );
  unsupported.push(
    "difficulty_gap: not available - requires item-difficulty-band mastery data this reference implementation does not model"
  );

  return { capability, accuracyGap, speedGap, consistencyGap, unsupported };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
