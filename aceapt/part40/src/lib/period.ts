/** Period labels are "YYYY-Qn" throughout Feature 40 (spec ??18 example:
 * "2026 Q1 -> 2026 Q2 -> 2026 Q3"). Centralized here so every service/route
 * agrees on the current period without recomputing the formula. */
export function currentPeriod(date: Date = new Date()): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

/** Converts "YYYY-Qn" into the [start, end) UTC date range it covers. Needed
 * because opportunities (the Feature 39 stand-in) are logged with a single
 * posted_at timestamp, not a period label -- computing "this quarter's"
 * market snapshot means filtering by this range, not reading the whole
 * table (see the header note on getOpportunityRequirementFrequencies for the
 * bug this fixes: without a date filter, ingesting Q1/Q2/Q3 in sequence
 * would each aggregate ALL opportunities ever inserted, collapsing three
 * seeded periods into one identical snapshot). */
export function periodToDateRange(period: string): { start: Date; end: Date } {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) throw new Error(`Invalid period label: ${period} (expected YYYY-Qn)`);
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3; // 0-indexed
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start, end };
}

export function periodsBack(n: number, from: Date = new Date()): string[] {
  const periods: string[] = [];
  let year = from.getUTCFullYear();
  let quarter = Math.floor(from.getUTCMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    periods.unshift(`${year}-Q${quarter}`);
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return periods;
}
