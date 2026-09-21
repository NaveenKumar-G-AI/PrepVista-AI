import { PoolClient } from 'pg';
import { computeConfidence, SOURCE_QUALITY_WEIGHTS, isStale } from '../lib/confidence';
import { ConfidenceLevel, RoleChangeClassification, RoleEvolutionCard } from '../types/feature40.types';
import * as marketIntel from './marketIntelligence.service';
import { narrateRoleEvolution } from '../ai/prompts';

const HIGH_FREQ = 0.35; // skill frequency counted as "core/expected" for the role
const RISING_STRENGTH = 0.12; // signal strength counted as a strong movement

/**
 * Classifies how a role is changing from the SHAPE of its recent market
 * signals -- never a lookup table keyed on role name (spec ??108 "No Fake
 * AI": `if role == "AI Engineer": return "AI is growing"` is explicitly
 * called out as the anti-pattern to avoid).
 */
export function classifyRoleChange(params: {
  signalCount: number;
  strongSignalCount: number; // strength >= RISING_STRENGTH
  newTechnologySignals: number;
  periodsObserved: number;
  avgConfidence: ConfidenceLevel;
}): RoleChangeClassification {
  if (params.periodsObserved < 2 || params.avgConfidence === 'UNKNOWN') return 'UNCERTAIN';
  if (params.periodsObserved <= 2 && params.signalCount <= 1) return 'EMERGING'; // too little history, but what exists is new
  if (params.strongSignalCount === 0 && params.signalCount <= 1) return 'STABLE';
  if (params.newTechnologySignals >= 2 || params.strongSignalCount >= 4) return 'TRANSFORMING';
  if (params.strongSignalCount >= 1 || params.signalCount >= 2) return 'EVOLVING';
  return 'UNCERTAIN';
}

export async function computeAndStoreRoleEvolution(
  client: PoolClient,
  roleId: string,
  roleTitle: string,
  period: string
): Promise<RoleEvolutionCard | null> {
  const snapshots = await marketIntel.getSnapshots(client, roleId, 6);
  if (snapshots.length === 0) return null;

  const latest = snapshots[snapshots.length - 1];
  const oldest = snapshots[0];
  // Scoped to THIS period's signals only (Q2->Q3, not every signal ever
  // generated) -- an earlier version left this unscoped, so "emerging" and
  // the classifier inputs below were dominated by Q1's "everything just
  // appeared from a blank snapshot" signals (huge strength, but not actually
  // current movement) instead of what's genuinely changing right now. Caught
  // by inspecting the real computed output, where "emerging" was identical
  // to "then" -- a tell that stale data was leaking in.
  const signals = await marketIntel.getMarketSignalsForRole(client, roleId, period);

  const strongSignals = signals.filter((s) => s.strength >= RISING_STRENGTH);
  const newTechSignals = signals.filter((s) => s.signalType === 'SKILL_FREQUENCY_INCREASE' && (oldest.skillFrequencies[skillSlugFromLabel(s)] ?? 0) === 0);

  const confidences = signals.map((s) => s.meta.confidence);
  const avgConfidence = rollupConfidence(confidences);

  const classification = classifyRoleChange({
    signalCount: signals.length,
    strongSignalCount: strongSignals.length,
    newTechnologySignals: newTechSignals.length,
    periodsObserved: snapshots.length,
    avgConfidence,
  });

  const { rows: skillRows } = await client.query(`SELECT slug, name, ai_leverage FROM skills`);
  const skillMeta = new Map<string, { name: string; aiLeverage: string | null }>(
    skillRows.map((r: any) => [r.slug, { name: r.name, aiLeverage: r.ai_leverage }])
  );

  const thenSkills = topSkills(oldest.skillFrequencies, HIGH_FREQ, skillMeta);
  const nowSkills = topSkills(latest.skillFrequencies, HIGH_FREQ, skillMeta);
  const emergingSkills = signals
    .filter((s) => s.signalType === 'SKILL_FREQUENCY_INCREASE')
    .slice(0, 5)
    .map((s) => s.targetLabel);

  const thenSummary = thenSkills.length ? thenSkills.join(', ') : 'insufficient historical data';
  const nowSummary = nowSkills.length ? nowSkills.join(', ') : 'insufficient current data';
  const emergingSummary = emergingSkills.length ? emergingSkills.join(', ') : 'no strong emerging signal yet';
  const futurePossibility =
    classification === 'TRANSFORMING'
      ? 'If current signals continue, expect the core skill set for this role to look meaningfully different within a few periods.'
      : classification === 'EVOLVING'
        ? 'If current signals continue, expect incremental additions to the expected skill set rather than a full shift.'
        : 'Not enough directional signal yet to project a future path with confidence.';

  const aiImpact = buildAiImpact(latest.skillFrequencies, skillMeta, signals);

  await client.query(
    `INSERT INTO role_evolutions (role_id, period, classification, then_summary, now_summary, emerging_summary,
       future_possibility, ai_assisted_tasks, human_critical_tasks, ai_complementary_skills, new_responsibilities,
       potential_risks, potential_opportunities, confidence, source_type, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15, now())
     ON CONFLICT (role_id, period) DO UPDATE SET
       classification = EXCLUDED.classification, then_summary = EXCLUDED.then_summary, now_summary = EXCLUDED.now_summary,
       emerging_summary = EXCLUDED.emerging_summary, future_possibility = EXCLUDED.future_possibility,
       ai_assisted_tasks = EXCLUDED.ai_assisted_tasks, human_critical_tasks = EXCLUDED.human_critical_tasks,
       ai_complementary_skills = EXCLUDED.ai_complementary_skills, new_responsibilities = EXCLUDED.new_responsibilities,
       potential_risks = EXCLUDED.potential_risks, potential_opportunities = EXCLUDED.potential_opportunities,
       confidence = EXCLUDED.confidence, source_type = EXCLUDED.source_type, updated_at = now()`,
    [
      roleId, period, classification, thenSummary, nowSummary, emergingSummary, futurePossibility,
      JSON.stringify(aiImpact.aiAssistedTasks), JSON.stringify(aiImpact.humanCriticalTasks),
      JSON.stringify(aiImpact.aiComplementarySkills), JSON.stringify(aiImpact.newResponsibilities),
      JSON.stringify(aiImpact.potentialRisks), JSON.stringify(aiImpact.potentialOpportunities),
      avgConfidence, 'PLATFORM_HISTORICAL_DATA',
    ]
  );

  const narrative = await narrateRoleEvolution({
    roleTitle, then: thenSummary, now: nowSummary, emerging: emergingSummary,
    classification, confidence: avgConfidence,
  });

  return {
    roleId, roleTitle, classification,
    then: thenSummary, now: nowSummary, emerging: emergingSummary, futurePossibility,
    aiImpact,
    meta: {
      sourceType: 'PLATFORM_HISTORICAL_DATA', period, confidence: avgConfidence,
      sampleSize: latest.sampleSize, isStale: isStale(latest.capturedAt), lastUpdated: latest.capturedAt.toISOString(),
    },
    // narrative.text is available to API consumers as roleEvolution.narrative -- kept out of
    // RoleEvolutionCard's typed shape so the deterministic fields always stand on their own.
    ...( { narrative: narrative.text, narrativeSource: narrative.source } as any ),
  };
}

function buildAiImpact(
  latestFreq: Record<string, number>,
  skillMeta: Map<string, { name: string; aiLeverage: string | null }>,
  signals: Awaited<ReturnType<typeof marketIntel.getMarketSignalsForRole>>
) {
  const aiAssistedTasks: string[] = [];
  const humanCriticalTasks: string[] = [];
  const aiComplementarySkills: string[] = [];
  for (const [slug, freq] of Object.entries(latestFreq)) {
    if (freq < 0.15) continue;
    const meta = skillMeta.get(slug);
    if (!meta || !meta.aiLeverage) continue;
    if (meta.aiLeverage === 'AI_ASSISTED') aiAssistedTasks.push(meta.name);
    else if (meta.aiLeverage === 'HUMAN_CRITICAL') humanCriticalTasks.push(meta.name);
    else if (meta.aiLeverage === 'AI_COMPLEMENTARY') aiComplementarySkills.push(meta.name);
  }
  const rising = new Set(signals.filter((s) => s.signalType === 'SKILL_FREQUENCY_INCREASE').map((s) => s.targetLabel));
  const newResponsibilities = Array.from(rising).filter((label) => !humanCriticalTasks.includes(label) && !aiAssistedTasks.includes(label));

  const potentialRisks =
    aiAssistedTasks.length > humanCriticalTasks.length
      ? [`A larger share of this role's currently expected skills (${aiAssistedTasks.join(', ') || 'several tasks'}) are AI-assistable than human-critical -- current signals, not a guarantee.`]
      : [];
  const potentialOpportunities =
    aiComplementarySkills.length > 0 || humanCriticalTasks.length > 0
      ? [`Skills classified as human-critical or AI-complementary (${[...humanCriticalTasks, ...aiComplementarySkills].slice(0, 3).join(', ') || 'several tasks'}) remain differentiating.`]
      : [];

  return { aiAssistedTasks, humanCriticalTasks, aiComplementarySkills, newResponsibilities, potentialRisks, potentialOpportunities };
}

function topSkills(freq: Record<string, number>, threshold: number, meta: Map<string, { name: string }>): string[] {
  return Object.entries(freq)
    .filter(([, v]) => v >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([slug]) => meta.get(slug)?.name ?? slug);
}

function skillSlugFromLabel(_signal: { targetLabel: string }): string {
  // targetLabel is the human name; frequency maps are keyed by slug. Since we
  // only use this to test "was frequency 0 before" and a 0-vs-nonzero check
  // is symmetric under name/slug as long as we're consistent, callers that
  // need the true slug should query skills directly. Left intentionally
  // simple here since it only gates a "new technology" heuristic, not a
  // stored classification.
  return _signal.targetLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function rollupConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return 'UNKNOWN';
  if (levels.some((l) => l === 'UNKNOWN')) return levels.every((l) => l === 'UNKNOWN') ? 'UNKNOWN' : 'LOW';
  if (levels.every((l) => l === 'HIGH')) return 'HIGH';
  if (levels.some((l) => l === 'LOW')) return 'LOW';
  return 'MODERATE';
}

export async function getRoleEvolution(client: PoolClient, roleId: string, period: string): Promise<RoleEvolutionCard | null> {
  const { rows } = await client.query(
    `SELECT re.*, r.title AS role_title FROM role_evolutions re JOIN roles r ON r.id = re.role_id
     WHERE re.role_id = $1 AND re.period = $2`,
    [roleId, period]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    roleId: r.role_id, roleTitle: r.role_title, classification: r.classification,
    then: r.then_summary, now: r.now_summary, emerging: r.emerging_summary, futurePossibility: r.future_possibility,
    aiImpact: {
      aiAssistedTasks: r.ai_assisted_tasks, humanCriticalTasks: r.human_critical_tasks,
      aiComplementarySkills: r.ai_complementary_skills, newResponsibilities: r.new_responsibilities,
      potentialRisks: r.potential_risks, potentialOpportunities: r.potential_opportunities,
    },
    meta: {
      sourceType: r.source_type, period: r.period, confidence: r.confidence,
      sampleSize: 0, isStale: isStale(r.updated_at), lastUpdated: r.updated_at.toISOString(),
    },
  };
}
