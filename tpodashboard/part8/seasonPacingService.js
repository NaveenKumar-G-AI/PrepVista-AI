function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Linear interpolation against last season's sampled placement curve.
 * Deliberately labeled an observed comparison, not a forecast — this
 * says where we are relative to last year at the same point, not where
 * we'll end up (that's Part 15's job, per the original spec's own
 * boundary between sections 49 and 64).
 *
 * @param {number} currentPlacedPct
 * @param {number} seasonProgressFraction  0..1
 * @param {{progressFraction: number, placedPct: number}[]} priorSeasonCurve
 */
function seasonPacing(currentPlacedPct, seasonProgressFraction, priorSeasonCurve) {
  const sorted = [...priorSeasonCurve].sort((a, b) => a.progressFraction - b.progressFraction);
  let baseline = sorted.length > 0 ? sorted[sorted.length - 1].placedPct : null;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (seasonProgressFraction >= a.progressFraction && seasonProgressFraction <= b.progressFraction) {
      const span = b.progressFraction - a.progressFraction;
      const t = span > 0 ? (seasonProgressFraction - a.progressFraction) / span : 0;
      baseline = a.placedPct + t * (b.placedPct - a.placedPct);
      break;
    }
  }

  if (baseline === null) {
    return {
      seasonProgressPct: round2(seasonProgressFraction * 100),
      currentPlacedPct: round2(currentPlacedPct),
      priorSeasonBaselinePct: null,
      deltaVsPriorSeasonPts: null,
      note: 'No prior-season curve available to compare against.',
    };
  }

  return {
    seasonProgressPct: round2(seasonProgressFraction * 100),
    currentPlacedPct: round2(currentPlacedPct),
    priorSeasonBaselinePct: round2(baseline),
    deltaVsPriorSeasonPts: round2(currentPlacedPct - baseline),
    interpretation: 'OBSERVED_COMPARISON',
    note: "Compared against last season's placement curve at the same point in the season — not a projection of where this season will end up.",
  };
}

module.exports = { seasonPacing };
