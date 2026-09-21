import { PoolClient } from 'pg';
import { computeConfidence, SOURCE_QUALITY_WEIGHTS, isStale } from '../lib/confidence';
import { ConfidenceLevel, FutureGapCard, FutureGapSeverity } from '../types/feature40.types';
import * as marketIntel from './marketIntelligence.service';
import * as feature37 from '../integrations/feature37.adapter';
import { narrateFutureGap } from '../ai/prompts';

/** Below this market frequency, a skill isn't relevant enough to this role to
 * be worth a gap row at all -- prevents noise (spec ??20 "Personal Future
 * Gap" should surface what matters, not everything). */
const RELEVANCE_FLOOR = 0.15;
/** Below this magnitude, evidence is judged to already cover the expectation
 * -- no gap worth recording. */
const MEANINGFUL_GAP_FLOOR = 0.1;
/** Unverified evidence still counts, but only partially, until Feature 37
 * verifies it -- Feature 40 never treats "claimed" as equivalent to
 * "verified" (this mirrors the fit-vs-readiness distinction from the ALIGN
 * engine, [[aceapt]] Feature 29). */
const UNVERIFIED_EVIDENCE_DISCOUNT = 0.5;

export function classifyGapSeverity(params: {
  gapMagnitude: number; // 0..1
  marketExpectation: number; // 0..1
  confidence: ConfidenceLevel;
}): FutureGapSeverity {
  if (params.confidence === 'UNKNOWN') return 'UNKNOWN';
  const priorityScore = params.gapMagnitude * params.marketExpectation;
  // Low-confidence data can still surface a gap, but is deliberately capped
  // below CRITICAL -- spec ??63 "never convert a small sample into a strong
  // forecast."
  const ceiling: FutureGapSeverity = params.confidence === 'LOW' ? 'MODERATE' : 'CRITICAL';
  const rank: FutureGapSeverity[] = ['OPTIONAL', 'MODERATE', 'HIGH', 'CRITICAL'];

  let raw: FutureGapSeverity;
  if (priorityScore >= 0.35) raw = 'CRITICAL';
  else if (priorityScore >= 0.2) raw = 'HIGH';
  else if (priorityScore >= 0.08) raw = 'MODERATE';
  else raw = 'OPTIONAL';

  if (rank.indexOf(raw) > rank.indexOf(ceiling)) return ceiling;
  return raw;
}

export async function computeAndStoreFutureGaps(
  client: PoolClient,
  studentId: string,
  roleId: string,
  roleTitle: string,
  period: string
): Promise<FutureGapCard[]> {
  const snapshots = await marketIntel.getSnapshots(client, roleId, 1);
  if (snapshots.length === 0) return [];
  const latest = snapshots[snapshots.length - 1];

  const evidenceMap = await feature37.getEvidenceMap(client, studentId);
  const { rows: skillRows } = await client.query(`SELECT id, slug, name FROM skills`);
  const skillBySlug = new Map<string, { id: string; name: string }>(skillRows.map((r: any) => [r.slug, { id: r.id, name: r.name }]));

  const results: FutureGapCard[] = [];

  for (const [slug, marketExpectation] of Object.entries(latest.skillFrequencies)) {
    if (marketExpectation < RELEVANCE_FLOOR) continue;
    const skill = skillBySlug.get(slug);
    if (!skill) continue;

    const evidence = evidenceMap.get(slug);
    const effectiveEvidence = evidence ? evidence.strength * (evidence.verifiedCount > 0 ? 1 : UNVERIFIED_EVIDENCE_DISCOUNT) : 0;
    const gapMagnitude = Math.max(0, marketExpectation - effectiveEvidence);
    if (gapMagnitude < MEANINGFUL_GAP_FLOOR) continue;

    const confidence = computeConfidence({
      sampleSize: latest.sampleSize,
      sourceQuality: SOURCE_QUALITY_WEIGHTS[latest.sourceType],
      recencyDays: 0,
      sourceAgreement: 0.6,
    });
    const severity = classifyGapSeverity({ gapMagnitude, marketExpectation, confidence });

    const marketExpectationText = `${skill.name} appears in about ${Math.round(marketExpectation * 100)}% of recent opportunities and market signals for ${roleTitle}.`;
    const studentEvidenceText = feature37.describeEvidence(evidence);
    const recommendedAction = recommendActionFor(skill.name, evidence, gapMagnitude);

    const narrated = await narrateFutureGap({
      skillName: skill.name, marketExpectation: marketExpectationText, studentEvidence: studentEvidenceText, severity,
    });

    // Upsert relies on the unique constraint added in migration 007 -- see
    // that file for the bug this fixes (ON CONFLICT with no matching
    // constraint would otherwise fail on the very first recomputation).
    const { rows } = await client.query(
      `INSERT INTO future_gaps (student_id, target_role_id, skill_id, severity, market_expectation, student_evidence,
         explanation, recommended_action, confidence, period, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OPEN', now())
       ON CONFLICT (student_id, target_role_id, skill_id, period) DO UPDATE SET
         severity = EXCLUDED.severity, market_expectation = EXCLUDED.market_expectation,
         student_evidence = EXCLUDED.student_evidence, explanation = EXCLUDED.explanation,
         recommended_action = EXCLUDED.recommended_action, confidence = EXCLUDED.confidence, updated_at = now(),
         status = CASE WHEN future_gaps.status = 'DISMISSED' THEN future_gaps.status ELSE 'OPEN' END
       RETURNING id, status, updated_at`,
      [studentId, roleId, skill.id, severity, marketExpectationText, studentEvidenceText, narrated.text, recommendedAction, confidence, period]
    );

    results.push({
      id: rows[0].id, skillId: skill.id, skillName: skill.name, severity,
      marketExpectation: marketExpectationText, studentEvidence: studentEvidenceText,
      explanation: narrated.text, recommendedAction, status: rows[0].status,
      meta: { sourceType: latest.sourceType, period, confidence, sampleSize: latest.sampleSize, isStale: isStale(latest.capturedAt), lastUpdated: rows[0].updated_at.toISOString() },
    });
  }

  return results.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function recommendActionFor(skillName: string, evidence: { itemCount: number; verifiedCount: number } | undefined, gapMagnitude: number): string {
  if (!evidence) return `Build one project or verified assessment that clearly demonstrates ${skillName}.`;
  if (evidence.verifiedCount === 0) return `Get your existing ${skillName} work verified -- you have unverified evidence that may already close part of this gap.`;
  if (gapMagnitude >= 0.35) return `Deepen ${skillName} with a production-style project; current evidence covers only a fraction of what the market expects.`;
  return `Add one more piece of evidence for ${skillName} to strengthen an already-started area.`;
}

function severityRank(s: FutureGapSeverity): number {
  return { CRITICAL: 4, HIGH: 3, MODERATE: 2, OPTIONAL: 1, UNKNOWN: 0 }[s];
}

export async function getOpenFutureGaps(client: PoolClient, studentId: string, roleId: string): Promise<FutureGapCard[]> {
  const { rows } = await client.query(
    `SELECT fg.*, s.name AS skill_name FROM future_gaps fg LEFT JOIN skills s ON s.id = fg.skill_id
     WHERE fg.student_id = $1 AND fg.target_role_id = $2 AND fg.status != 'DISMISSED'
     ORDER BY CASE fg.severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MODERATE' THEN 2 WHEN 'OPTIONAL' THEN 1 ELSE 0 END DESC`,
    [studentId, roleId]
  );
  return rows.map((r) => ({
    id: r.id, skillId: r.skill_id, skillName: r.skill_name, severity: r.severity,
    marketExpectation: r.market_expectation, studentEvidence: r.student_evidence,
    explanation: r.explanation, recommendedAction: r.recommended_action, status: r.status,
    meta: { sourceType: 'PLATFORM_HISTORICAL_DATA', period: r.period, confidence: r.confidence, sampleSize: 0, isStale: isStale(r.updated_at), lastUpdated: r.updated_at.toISOString() },
  }));
}
