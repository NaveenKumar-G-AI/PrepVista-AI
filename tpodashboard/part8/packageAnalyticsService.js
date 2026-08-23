function round2(n) {
  return Math.round(n * 100) / 100;
}

function median(sortedValues) {
  const n = sortedValues.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 !== 0 ? sortedValues[mid] : round2((sortedValues[mid - 1] + sortedValues[mid]) / 2);
}

/**
 * @param {{ctcLPA: number}[]} offers  typically each student's HIGHEST
 *   accepted offer, not every offer extended — an offer a student
 *   declined shouldn't count toward "average package," and counting a
 *   student's 3 offers as 3 data points inflates the sample. Pass the
 *   right slice in; this function trusts what it's given.
 */
function packageStats(offers) {
  const values = offers.map((o) => o.ctcLPA).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (values.length === 0) {
    return { count: 0, averageLPA: null, medianLPA: null, highestLPA: null, lowestLPA: null, note: 'No offers with a recorded CTC.' };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    averageLPA: round2(values.reduce((a, b) => a + b, 0) / values.length),
    medianLPA: median(sorted),
    highestLPA: sorted[sorted.length - 1],
    lowestLPA: sorted[0],
    note: null,
  };
}

function packageStatsByGroup(offersWithGroup, groupKey) {
  const groups = {};
  for (const item of offersWithGroup) {
    const key = item[groupKey];
    (groups[key] = groups[key] || []).push(item);
  }
  const result = {};
  for (const [key, items] of Object.entries(groups)) result[key] = packageStats(items);
  return result;
}

const DEFAULT_BANDS = [
  { label: '< 6 LPA', min: -Infinity, max: 6 },
  { label: '6–10 LPA', min: 6, max: 10 },
  { label: '10–20 LPA', min: 10, max: 20 },
  { label: '20+ LPA', min: 20, max: Infinity },
];

function packageDistribution(offers, bands = DEFAULT_BANDS) {
  const values = offers.map((o) => o.ctcLPA).filter((v) => typeof v === 'number');
  return bands.map((band) => ({
    label: band.label,
    count: values.filter((v) => v >= band.min && v < band.max).length,
  }));
}

module.exports = { packageStats, packageStatsByGroup, packageDistribution, DEFAULT_BANDS };
