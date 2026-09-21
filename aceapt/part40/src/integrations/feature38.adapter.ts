import { PoolClient } from 'pg';
import * as standins from '../db/standins';

/**
 * Feature 38 provides professional positioning / narrative / differentiators
 * (spec ??53). Feature 40's job is narrow: determine whether that positioning
 * still fits where the market is moving -- it never rewrites or judges the
 * positioning itself.
 */

export interface Positioning {
  headline: string | null;
  differentiators: string[];
}

export async function getPositioning(client: PoolClient, studentId: string): Promise<Positioning> {
  const p = await standins.getPositioning(client, studentId);
  return p ?? { headline: null, differentiators: [] };
}

/** Returns differentiator skill slugs that market data flags as declining --
 * i.e. positioning that may need refreshing as the market moves. Pure
 * set-comparison; no judgment about whether that's "bad", just a fact for the
 * student to see (spec ??53). */
export function positioningAtRisk(differentiators: string[], decliningSkillSlugs: Set<string>): string[] {
  return differentiators.filter((d) => decliningSkillSlugs.has(d));
}
