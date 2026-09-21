import { PoolClient } from 'pg';
import { isStale } from '../lib/confidence';
import { TechnologyDecision } from '../types/feature40.types';
import * as marketIntel from './marketIntelligence.service';
import { getOpenFutureGaps } from './futureGap.service';
import { narrateWeeklyBrief } from '../ai/prompts';
import { currentPeriod } from '../lib/period';

/** Spec ??47 Daily Career Signal -- ONE personalized item, never a news feed
 * (spec ??50). Picks the highest-strength signal not already surfaced today.
 * Scoped to the CURRENT period only -- see the fix note in
 * roleEvolution.service.ts for why an unfiltered, all-time signal query
 * silently surfaces stale "first ever appeared" signals instead of what's
 * actually moving now. */
export async function generateDailySignal(client: PoolClient, studentId: string, roleId: string, roleTitle: string, period: string = currentPeriod()) {
  const signals = await marketIntel.getMarketSignalsForRole(client, roleId, period);
  if (signals.length === 0) return null;

  const { rows: recentRows } = await client.query(
    `SELECT payload_key FROM (
       SELECT (headline) AS payload_key FROM market_insights
       WHERE student_id = $1 AND insight_type = 'DAILY_SIGNAL' AND created_at > now() - interval '20 hours'
     ) t`,
    [studentId]
  );
  const alreadyShown = new Set(recentRows.map((r: any) => r.payload_key));

  const top = signals.find((s) => !alreadyShown.has(headlineFor(s)));
  if (!top) return null;

  const headline = headlineFor(top);
  const gaps = await getOpenFutureGaps(client, studentId, roleId);
  const relatedGap = gaps.find((g) => g.skillName === top.targetLabel);
  const whyItMatters = relatedGap
    ? `This directly affects an open gap in your profile (${relatedGap.severity.toLowerCase()} priority).`
    : `This is relevant to ${roleTitle}, your active target role.`;
  const recommendedAction = relatedGap ? relatedGap.recommendedAction : 'Keep an eye on this signal; no immediate action needed yet.';

  const { rows } = await client.query(
    `INSERT INTO market_insights (student_id, role_id, skill_id, insight_type, headline, body, why_it_matters,
       recommended_action, confidence, source_type, period)
     VALUES ($1,$2,NULL,'DAILY_SIGNAL',$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at`,
    [studentId, roleId, headline, top.interpretation, whyItMatters, recommendedAction, top.meta.confidence, top.meta.sourceType, top.period]
  );

  return { id: rows[0].id, headline, body: top.interpretation, whyItMatters, recommendedAction, confidence: top.meta.confidence, createdAt: rows[0].created_at };
}

function headlineFor(signal: { signalType: string; targetLabel: string }): string {
  return signal.signalType === 'SKILL_FREQUENCY_INCREASE'
    ? `${signal.targetLabel} is appearing increasingly across opportunities aligned with your target role.`
    : `${signal.targetLabel}'s presence is declining across opportunities aligned with your target role.`;
}

/** Spec ??48 Weekly Market Brief. Also scoped to the current period -- same
 * reasoning as generateDailySignal above. */
export async function generateWeeklyBrief(client: PoolClient, studentId: string, roleId: string, roleTitle: string, period: string = currentPeriod()) {
  const signals = await marketIntel.getMarketSignalsForRole(client, roleId, period);
  const changed = await marketIntel.whatChanged(client, roleId);
  const gaps = await getOpenFutureGaps(client, studentId, roleId);

  const topSignals = signals.slice(0, 3).map((s) => s.interpretation);
  const topGaps = gaps.slice(0, 3).map((g) => `${g.skillName} (${g.severity.toLowerCase()})`);

  const narrated = await narrateWeeklyBrief({ roleTitle, topSignals, topGaps });

  const { rows } = await client.query(
    `INSERT INTO market_insights (student_id, role_id, insight_type, headline, body, why_it_matters, recommended_action, confidence, source_type, period)
     VALUES ($1,$2,'WEEKLY_BRIEF',$3,$4,$5,$6,$7,'PLATFORM_HISTORICAL_DATA',$8) RETURNING id, created_at`,
    [
      studentId, roleId, `Your weekly Career Horizon for ${roleTitle}`, narrated.text,
      changed.length ? `${changed.length} market change(s) detected this week.` : 'No significant market change detected this week.',
      gaps[0]?.recommendedAction ?? 'No open priorities right now.',
      rollupConfidence(signals.map((s) => s.meta.confidence)), 'current',
    ]
  );

  return {
    id: rows[0].id, roleTitle, narrative: narrated.text, marketMovement: changed,
    roleChange: topSignals, yourGaps: topGaps,
    learningPriority: gaps[0]?.skillName ?? null, projectPriority: gaps[0]?.recommendedAction ?? null,
    createdAt: rows[0].created_at,
  };
}

function rollupConfidence(levels: string[]): string {
  if (levels.length === 0) return 'UNKNOWN';
  if (levels.every((l) => l === 'HIGH')) return 'HIGH';
  if (levels.some((l) => l === 'LOW' || l === 'UNKNOWN')) return 'LOW';
  return 'MODERATE';
}

/** Spec ??44 Technology Decision Engine: "Should I learn X?" */
export async function evaluateTechnologyDecision(
  client: PoolClient,
  technologyName: string,
  roleId: string | null
): Promise<{ decision: TechnologyDecision; reasoning: string; confidence: string }> {
  const { rows } = await client.query(
    `SELECT * FROM technology_signals WHERE lower(technology_name) = lower($1) ORDER BY period DESC LIMIT 1`,
    [technologyName]
  );

  if (rows.length === 0) {
    // Fall back to skill_trends if this "technology" is actually a tracked skill.
    const { rows: skillRows } = await client.query(
      `SELECT st.classification, st.confidence FROM skill_trends st JOIN skills s ON s.id = st.skill_id
       WHERE lower(s.name) = lower($1) ${roleId ? 'AND st.role_id = $2' : ''} ORDER BY st.updated_at DESC LIMIT 1`,
      roleId ? [technologyName, roleId] : [technologyName]
    );
    if (skillRows.length === 0) {
      return { decision: 'MONITOR', reasoning: `No market data on file yet for "${technologyName}" -- insufficient evidence to recommend confidently.`, confidence: 'UNKNOWN' };
    }
    const s = skillRows[0];
    const decision: TechnologyDecision = s.classification === 'GROWING' || s.classification === 'DURABLE' ? 'LEARN_NOW'
      : s.classification === 'EMERGING' ? 'MONITOR'
      : s.classification === 'DECLINING' ? 'NOT_A_PRIORITY' : 'OPTIONAL';
    return { decision, reasoning: `Classified as ${s.classification.toLowerCase()} based on tracked skill trend data.`, confidence: s.confidence };
  }

  const t = rows[0];
  const maturityScore = { ESTABLISHED: 1, GROWING: 0.75, EMERGING: 0.5, DECLINING: 0.15, UNKNOWN: 0 }[t.maturity as string] ?? 0;
  const compositeScore = maturityScore * 0.4 + Number(t.employer_adoption) * 0.35 + Number(t.transferability) * 0.25;

  let decision: TechnologyDecision;
  if (t.maturity === 'DECLINING') decision = 'NOT_A_PRIORITY';
  else if (compositeScore >= 0.65 && t.confidence !== 'LOW' && t.confidence !== 'UNKNOWN') decision = 'LEARN_NOW';
  else if (compositeScore >= 0.4) decision = 'MONITOR';
  else decision = 'OPTIONAL';

  return {
    decision,
    reasoning: `Maturity: ${t.maturity.toLowerCase()}, employer adoption: ${Math.round(Number(t.employer_adoption) * 100)}%, transferability: ${Math.round(Number(t.transferability) * 100)}% (sample size ${t.sample_size}).`,
    confidence: t.confidence,
  };
}
