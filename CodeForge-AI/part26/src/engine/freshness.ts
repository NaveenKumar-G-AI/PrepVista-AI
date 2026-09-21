import { Freshness } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';

export function computeFreshness(lastDemonstratedAt: string | null, nowIso: string): Freshness {
  if (!lastDemonstratedAt) return Freshness.UNKNOWN;
  const ageDays = (Date.parse(nowIso) - Date.parse(lastDemonstratedAt)) / (1000 * 60 * 60 * 24);
  const { recentDays, agingDays, staleDays } = SignalPolicy.freshness;
  if (ageDays <= recentDays) return Freshness.RECENT;
  if (ageDays <= agingDays) return Freshness.AGING;
  if (ageDays <= staleDays) return Freshness.STALE;
  return Freshness.VERY_STALE;
}
