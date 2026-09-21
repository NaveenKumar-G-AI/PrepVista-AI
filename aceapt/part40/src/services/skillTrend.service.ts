import { PoolClient } from 'pg';
import { computeConfidence, SOURCE_QUALITY_WEIGHTS, isStale, hasInsufficientEvidence } from '../lib/confidence';
import { SkillTrendCard, SkillTrendClassification } from '../types/feature40.types';
import * as marketIntel from './marketIntelligence.service';

const EMERGING_FLOOR = 0.05; // below this, not even "emerging" -- just noise
const GROWING_MIN_LEVEL = 0.2; // already meaningfully present, and rising
const DURABLE_MIN_LEVEL = 0.3; // durable requires sustained presence, not just one high period
const DURABLE_MIN_PERIODS = 3;
/** How much first->latest drift still counts as "stable" for DURABLE, and
 * the mirror-image floor for DECLINING. Originally 0.08 (matching
 * marketIntelligence.service's single-period SIGNIFICANT_DELTA) but that
 * was too tight once tested against realistically-sampled data: a skill
 * seeded to be flat around ~85-90% swung 8.7 points across 3 quarters from
 * sampling noise alone at n=150/quarter and was misclassified DECLINING.
 * SIGNIFICANT_DELTA is a fair bar for "did ONE quarter move" (used to decide
 * whether to emit a market_signal at all); classifying a multi-period TREND
 * from first vs. latest needs more room before calling noisy drift a real
 * decline. Widened after catching the misclassification against real
 * ingested numbers, not guessed in advance. */
const STABLE_BAND = 0.1;

/**
 * Classifies a single skill's trajectory FOR A GIVEN ROLE from its actual
 * frequency history across snapshots (spec ??14). Needs >=2 periods to say
 * anything about direction; with only one, the honest answer is UNKNOWN, not
 * a guess dressed up as one of the six labels.
 */
export function classifySkillTrend(history: number[]): SkillTrendClassification {
  if (history.length < 2) return 'UNKNOWN';
  const latest = history[history.length - 1];
  const first = history[0];
  const delta = latest - first;
  const consistentlyHigh = history.length >= DURABLE_MIN_PERIODS && history.every((v) => v >= DURABLE_MIN_LEVEL);

  if (consistentlyHigh && Math.abs(delta) < STABLE_BAND) return 'DURABLE';
  if (latest < EMERGING_FLOOR && first < EMERGING_FLOOR) return 'UNKNOWN'; // never showed up meaningfully
  if (delta <= -STABLE_BAND) return 'DECLINING';
  // "Already substantial and still rising" beats "technically first seen
  // near zero" -- a skill that shot from 3% to 60% is GROWING, not merely
  // EMERGING (spec ??14 EMERGING is explicitly "early" -- 60% isn't early).
  if (latest >= GROWING_MIN_LEVEL && delta > 0) return 'GROWING';
  if (first < EMERGING_FLOOR && latest >= EMERGING_FLOOR) return 'EMERGING';
  if (latest >= EMERGING_FLOOR) return 'ROLE_SPECIFIC';
  return 'UNKNOWN';
}

export async function computeAndStoreSkillTrends(client: PoolClient, roleId: string, period: string): Promise<void> {
  const snapshots = await marketIntel.getSnapshots(client, roleId, 6);
  if (snapshots.length === 0) return;

  const { rows: skillRows } = await client.query(`SELECT id, slug, name FROM skills`);
  const latest = snapshots[snapshots.length - 1];

  for (const skill of skillRows) {
    const history = snapshots.map((s) => s.skillFrequencies[skill.slug] ?? 0);
    if (history.every((v) => v === 0)) continue; // never appears for this role at all -- nothing to say

    const classification = classifySkillTrend(history);
    const sampleSize = latest.sampleSize;
    const confidence = hasInsufficientEvidence(sampleSize)
      ? 'UNKNOWN'
      : computeConfidence({
          sampleSize,
          sourceQuality: SOURCE_QUALITY_WEIGHTS[latest.sourceType],
          recencyDays: 0,
          sourceAgreement: snapshots.length >= 3 ? 0.7 : 0.55,
        });

    const { explanation, recommendedAction } = explainSkillTrend(skill.name, classification, history[history.length - 1]);

    await client.query(
      `INSERT INTO skill_trends (skill_id, role_id, period, classification, market_signal_strength, sample_size,
         confidence, source_type, explanation, recommended_action, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (skill_id, role_id, period) DO UPDATE SET
         classification = EXCLUDED.classification, market_signal_strength = EXCLUDED.market_signal_strength,
         sample_size = EXCLUDED.sample_size, confidence = EXCLUDED.confidence, explanation = EXCLUDED.explanation,
         recommended_action = EXCLUDED.recommended_action, updated_at = now()`,
      [skill.id, roleId, period, classification, history[history.length - 1], sampleSize, confidence, latest.sourceType, explanation, recommendedAction]
    );
  }
}

function explainSkillTrend(skillName: string, classification: SkillTrendClassification, level: number): { explanation: string; recommendedAction: string } {
  switch (classification) {
    case 'DURABLE':
      return { explanation: `${skillName} has stayed consistently relevant across recent periods.`, recommendedAction: `Keep evidence for ${skillName} current; it is worth maintaining, not urgently expanding.` };
    case 'GROWING':
      return { explanation: `${skillName} is already common and its presence is increasing.`, recommendedAction: `Prioritize building or strengthening evidence for ${skillName}.` };
    case 'EMERGING':
      return { explanation: `${skillName} is a new but meaningful signal -- it barely appeared before and now does.`, recommendedAction: `Worth monitoring; light exploratory evidence is reasonable, heavy investment may be premature.` };
    case 'ROLE_SPECIFIC':
      return { explanation: `${skillName} shows up for this role specifically at a moderate, steady level.`, recommendedAction: `Useful if you're committed to this role; lower priority if you're keeping options open.` };
    case 'DECLINING':
      return { explanation: `${skillName}'s relative presence has been falling across recent periods.`, recommendedAction: `Not worth new investment right now; existing evidence doesn't need to be abandoned.` };
    default:
      return { explanation: `There isn't yet enough consistent history to classify ${skillName}'s trend confidently (currently observed at ~${Math.round(level * 100)}%).`, recommendedAction: `Revisit once more periods of data are available.` };
  }
}

export async function getSkillTrendsForRole(client: PoolClient, roleId: string, period: string): Promise<SkillTrendCard[]> {
  const { rows } = await client.query(
    `SELECT st.*, s.name AS skill_name FROM skill_trends st JOIN skills s ON s.id = st.skill_id
     WHERE st.role_id = $1 AND st.period = $2 ORDER BY st.market_signal_strength DESC`,
    [roleId, period]
  );
  return rows.map((r) => ({
    skillId: r.skill_id,
    skillName: r.skill_name,
    classification: r.classification,
    marketSignal: humanizeClassification(r.classification),
    studentStatus: 'see future gap', // resolved against evidence in futureGap.service, not here
    whyItMatters: r.explanation,
    recommendedAction: r.recommended_action,
    meta: {
      sourceType: r.source_type, period: r.period, confidence: r.confidence,
      sampleSize: r.sample_size, isStale: isStale(r.updated_at), lastUpdated: r.updated_at.toISOString(),
    },
  }));
}

function humanizeClassification(c: SkillTrendClassification): string {
  const map: Record<SkillTrendClassification, string> = {
    DURABLE: 'Durable', GROWING: 'Growing', EMERGING: 'Emerging',
    ROLE_SPECIFIC: 'Role-specific', DECLINING: 'Declining', UNKNOWN: 'Insufficient data',
  };
  return map[c];
}
