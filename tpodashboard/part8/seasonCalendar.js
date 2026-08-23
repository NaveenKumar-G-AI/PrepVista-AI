/**
 * Season calendar. A placement season has a shape — the same funnel
 * numbers mean something different in week 2 than in week 18 — and
 * several of the new analytics (zero-offer risk, pacing) need to know
 * where "now" sits in that shape. Treat these dates as an institution
 * setting, same as the readiness/risk config.
 */

const CURRENT_SEASON = {
  seasonId: '2026',
  startDate: '2026-06-01',
  endDate: '2026-10-01',
};

/** 0 (season just started) .. 1 (season over). Clamped either side. */
function seasonProgressFraction(now = new Date(), season = CURRENT_SEASON) {
  const start = new Date(season.startDate).getTime();
  const end = new Date(season.endDate).getTime();
  if (end <= start) return 1;
  return Math.max(0, Math.min(1, (now.getTime() - start) / (end - start)));
}

/**
 * DEMO data — last season's placed-% curve sampled at points through
 * the season, for the pacing comparison. In a real system this comes
 * from your own historical readiness_snapshot / offer data for the
 * prior season, not a hand-typed curve.
 */
const PRIOR_SEASON_PLACEMENT_CURVE = [
  { progressFraction: 0.0, placedPct: 0 },
  { progressFraction: 0.1, placedPct: 4 },
  { progressFraction: 0.2, placedPct: 12 },
  { progressFraction: 0.3, placedPct: 22 },
  { progressFraction: 0.4, placedPct: 34 },
  { progressFraction: 0.5, placedPct: 46 },
  { progressFraction: 0.6, placedPct: 56 },
  { progressFraction: 0.7, placedPct: 64 },
  { progressFraction: 0.8, placedPct: 70 },
  { progressFraction: 0.9, placedPct: 74 },
  { progressFraction: 1.0, placedPct: 77 },
];

module.exports = { CURRENT_SEASON, seasonProgressFraction, PRIOR_SEASON_PLACEMENT_CURVE };
