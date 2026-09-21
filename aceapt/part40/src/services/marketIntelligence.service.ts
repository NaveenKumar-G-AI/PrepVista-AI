import { PoolClient } from 'pg';
import { computeConfidence, daysBetween, isStale, SOURCE_QUALITY_WEIGHTS, hasInsufficientEvidence } from '../lib/confidence';
import { ConfidenceLevel, MarketSignalItem, SourceType } from '../types/feature40.types';
import * as feature39 from '../integrations/feature39.adapter';
import { periodToDateRange } from '../lib/period';

/** Minimum frequency delta between two snapshots to count as a real signal,
 * not noise (spec ??16 "never equate trend with truth"). */
const SIGNIFICANT_DELTA = 0.08;
/** Default cross-source agreement when only one source feeds a signal --
 * deliberately not 1.0: a single source has nothing to be corroborated
 * against yet (spec ??62). */
const SINGLE_SOURCE_AGREEMENT = 0.55;

export interface SnapshotRow {
  id: string;
  roleId: string;
  period: string;
  skillFrequencies: Record<string, number>;
  sampleSize: number;
  sourceType: SourceType;
  capturedAt: Date;
}

export async function getSnapshots(client: PoolClient, roleId: string, limit = 6): Promise<SnapshotRow[]> {
  const { rows } = await client.query(
    `SELECT id, role_id, period, skill_frequencies, sample_size, source_type, captured_at
     FROM market_snapshots WHERE role_id = $1 ORDER BY period DESC LIMIT $2`,
    [roleId, limit]
  );
  return rows.map(mapSnapshot).reverse(); // oldest -> newest
}

function mapSnapshot(r: any): SnapshotRow {
  return {
    id: r.id,
    roleId: r.role_id,
    period: r.period,
    skillFrequencies: r.skill_frequencies,
    sampleSize: r.sample_size,
    sourceType: r.source_type,
    capturedAt: r.captured_at,
  };
}

/**
 * Ingests a new market_snapshot for a role/period from opportunity data
 * (Feature 39 stand-in), then generates market_signal rows by diffing it
 * against the immediately prior snapshot. This is the ONE place snapshots
 * and signals are produced -- everything downstream (role evolution, skill
 * trends, future gaps) reads what this function wrote, it never derives its
 * own numbers from opportunities directly (spec ??65 "only create entities
 * actually necessary" -- one ingestion path, many consumers).
 *
 * Intended to run from the worker (aceapt_worker / BYPASSRLS), since it
 * touches only non-student-scoped tables and is triggered by a schedule, not
 * a single student's request.
 */
export async function ingestSnapshot(
  client: PoolClient,
  roleId: string,
  period: string,
  sourceType: SourceType = 'PLATFORM_HISTORICAL_DATA'
): Promise<{ snapshotId: string; signalsCreated: number }> {
  const { start, end } = periodToDateRange(period);
  const requirements = await feature39.getOpportunityRequirementsForRole(client, roleId, start, end);
  const skillFrequencies: Record<string, number> = {};
  let sampleSize = 0;
  for (const r of requirements) {
    skillFrequencies[r.skillSlug] = r.frequency;
    sampleSize = Math.max(sampleSize, r.sampleSize);
  }

  const { rows: prevRows } = await client.query(
    `SELECT skill_frequencies FROM market_snapshots WHERE role_id = $1 AND period < $2 ORDER BY period DESC LIMIT 1`,
    [roleId, period]
  );
  const previous: Record<string, number> = prevRows[0]?.skill_frequencies ?? {};

  const upserted = await client.query(
    `INSERT INTO market_snapshots (role_id, period, skill_frequencies, sample_size, source_type)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (role_id, period) DO UPDATE SET skill_frequencies = EXCLUDED.skill_frequencies,
       sample_size = EXCLUDED.sample_size, source_type = EXCLUDED.source_type
     RETURNING id`,
    [roleId, period, JSON.stringify(skillFrequencies), sampleSize, sourceType]
  );
  const snapshotId: string = upserted.rows[0].id;

  // Clear this period's previously-generated signals before regenerating
  // (idempotent re-ingestion, e.g. if opportunity data was corrected).
  await client.query(`DELETE FROM market_signals WHERE role_id = $1 AND period = $2`, [roleId, period]);

  let signalsCreated = 0;
  const allSlugs = new Set([...Object.keys(skillFrequencies), ...Object.keys(previous)]);
  for (const slug of allSlugs) {
    const now = skillFrequencies[slug] ?? 0;
    const before = previous[slug] ?? 0;
    const delta = now - before;
    if (Math.abs(delta) < SIGNIFICANT_DELTA) continue;

    const { rows: skillRows } = await client.query(`SELECT id FROM skills WHERE slug = $1`, [slug]);
    if (skillRows.length === 0) continue;
    const skillId = skillRows[0].id;

    const confidence = computeConfidence({
      sampleSize,
      sourceQuality: SOURCE_QUALITY_WEIGHTS[sourceType],
      recencyDays: 0, // just ingested
      sourceAgreement: SINGLE_SOURCE_AGREEMENT,
    });

    const signalType = delta > 0 ? 'SKILL_FREQUENCY_INCREASE' : 'SKILL_FREQUENCY_DECREASE';
    const interpretation =
      delta > 0
        ? `Appears in ${Math.round(before * 100)}% -> ${Math.round(now * 100)}% of recent opportunities for this role.`
        : `Appearance dropped from ${Math.round(before * 100)}% -> ${Math.round(now * 100)}% of recent opportunities for this role.`;

    await client.query(
      `INSERT INTO market_signals (role_id, skill_id, signal_type, period, strength, sample_size, source_type, confidence, interpretation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [roleId, skillId, signalType, period, Math.abs(delta), sampleSize, sourceType, confidence, interpretation]
    );
    signalsCreated += 1;
  }

  return { snapshotId, signalsCreated };
}

export async function getMarketSignalsForRole(client: PoolClient, roleId: string, period?: string): Promise<MarketSignalItem[]> {
  const { rows } = await client.query(
    `SELECT ms.id, ms.signal_type, ms.period, ms.strength, ms.interpretation, ms.confidence,
            ms.sample_size, ms.source_type, ms.created_at, s.name AS skill_name
     FROM market_signals ms
     LEFT JOIN skills s ON s.id = ms.skill_id
     WHERE ms.role_id = $1 ${period ? 'AND ms.period = $2' : ''}
     ORDER BY ms.strength DESC, ms.created_at DESC
     LIMIT 25`,
    period ? [roleId, period] : [roleId]
  );
  return rows.map((r) => ({
    id: r.id,
    signalType: r.signal_type,
    targetLabel: r.skill_name ?? 'this role',
    period: r.period,
    strength: Number(r.strength),
    interpretation: r.interpretation,
    meta: {
      sourceType: r.source_type,
      period: r.period,
      confidence: r.confidence as ConfidenceLevel,
      sampleSize: r.sample_size,
      isStale: isStale(r.created_at),
      lastUpdated: r.created_at.toISOString(),
    },
  }));
}

/** Spec ??18 "WHAT CHANGED?" -- plain-language diff between the two most
 * recent snapshots for a role. */
export async function whatChanged(client: PoolClient, roleId: string): Promise<string[]> {
  const snapshots = await getSnapshots(client, roleId, 2);
  if (snapshots.length < 2) return [];
  const [prev, latest] = snapshots;
  const { rows: skillRows } = await client.query(`SELECT slug, name FROM skills`);
  const nameBySlug = new Map<string, string>(skillRows.map((r: any) => [r.slug, r.name]));

  const changes: string[] = [];
  const slugs = new Set([...Object.keys(prev.skillFrequencies), ...Object.keys(latest.skillFrequencies)]);
  for (const slug of slugs) {
    const before = prev.skillFrequencies[slug] ?? 0;
    const now = latest.skillFrequencies[slug] ?? 0;
    if (Math.abs(now - before) < SIGNIFICANT_DELTA) continue;
    const name = nameBySlug.get(slug) ?? slug;
    const arrow = now > before ? 'up' : 'down';
    changes.push(`${name}: ${Math.round(before * 100)}% -> ${Math.round(now * 100)}% (${arrow} since ${prev.period})`);
  }
  return changes.sort((a, b) => b.length - a.length);
}

/** Spec ??62 Conflicting Sources -- flags a target where recent signals
 * disagree in direction, so callers can render a MIXED SIGNAL card instead
 * of silently picking one side. */
export function detectMixedSignal(signals: MarketSignalItem[]): { mixed: boolean; note: string | null } {
  const increases = signals.filter((s) => s.signalType === 'SKILL_FREQUENCY_INCREASE');
  const decreases = signals.filter((s) => s.signalType === 'SKILL_FREQUENCY_DECREASE');
  if (increases.length > 0 && decreases.length > 0) {
    return {
      mixed: true,
      note: `Signals disagree: ${increases.length} skill(s) trending up, ${decreases.length} trending down in the same period. Treat directional conclusions with caution.`,
    };
  }
  return { mixed: false, note: null };
}

export async function getSkillCombinationsForRole(client: PoolClient, roleId: string) {
  const { rows } = await client.query(
    `SELECT id, label, skill_ids, frequency, explanation, confidence, period
     FROM skill_combinations WHERE role_ids @> to_jsonb($1::text) ORDER BY frequency DESC LIMIT 10`,
    [roleId]
  );
  return rows;
}

export function hasInsufficientMarketData(sampleSize: number): boolean {
  return hasInsufficientEvidence(sampleSize);
}

export function daysSince(date: Date): number {
  return daysBetween(date, new Date());
}
