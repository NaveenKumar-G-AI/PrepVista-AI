import { Finding, DimensionScoreDetail, QualityDimension, ComparisonResult } from '../types';
import { DIMENSION_WEIGHTS, SEVERITY_BASE_DEDUCTION, CONFIDENCE_MULTIPLIER, SCORE_LABELS } from '../config';

export function computeScore(findings: Finding[]): { dimensionScores: DimensionScoreDetail[]; overallScore: number; overallLabel: string } {
  const dims = Object.keys(DIMENSION_WEIGHTS) as QualityDimension[];
  const running: Record<string, { score: number; contributions: DimensionScoreDetail['contributions'] }> = {};
  for (const d of dims) running[d] = { score: 100, contributions: [] };

  for (const f of findings) {
    // AI-origin findings are interpretive, not structural facts — they never move the
    // deterministic score. Only DETERMINISTIC findings can deduct points.
    if (f.origin !== 'DETERMINISTIC') continue;
    const base = SEVERITY_BASE_DEDUCTION[f.severity];
    const mult = CONFIDENCE_MULTIPLIER[f.confidence];
    for (const [dim, fraction] of Object.entries(f.dimensions)) {
      const deduction = base * mult * (fraction as number);
      if (deduction <= 0) continue;
      const bucket = running[dim];
      if (!bucket) continue;
      bucket.score -= deduction;
      bucket.contributions.push({ findingId: f.findingId, ruleId: f.ruleId, pointsDeducted: Math.round(deduction * 10) / 10 });
    }
  }

  const dimensionScores: DimensionScoreDetail[] = dims.map((d) => ({
    dimension: d,
    score: Math.max(0, Math.round(running[d].score)),
    contributions: running[d].contributions,
  }));

  let overall = 0;
  for (const ds of dimensionScores) overall += ds.score * DIMENSION_WEIGHTS[ds.dimension];
  overall = Math.max(0, Math.min(100, Math.round(overall)));

  let label = 'POOR';
  for (const [threshold, name] of SCORE_LABELS) {
    if (overall >= threshold) {
      label = name;
      break;
    }
  }

  return { dimensionScores, overallScore: overall, overallLabel: label };
}

export function pickMostImportantImprovement(findings: Finding[]): { title: string; why: string } | null {
  const candidates = findings.filter(
    (f) => f.origin === 'DETERMINISTIC' && (f.severity === 'HIGH' || f.severity === 'CRITICAL') && f.confidence !== 'LOW' && f.confidence !== 'UNKNOWN'
  );
  if (candidates.length === 0) return null;
  const weight = (f: Finding) => SEVERITY_BASE_DEDUCTION[f.severity] * CONFIDENCE_MULTIPLIER[f.confidence];
  candidates.sort((a, b) => weight(b) - weight(a));
  const top = candidates[0];
  return { title: top.suggestedAction, why: top.impact };
}

export function summarizeConfidence(findings: Finding[]) {
  const s = { high: 0, medium: 0, low: 0, unknown: 0 };
  for (const f of findings) {
    if (f.confidence === 'HIGH') s.high++;
    else if (f.confidence === 'MEDIUM') s.medium++;
    else if (f.confidence === 'LOW') s.low++;
    else s.unknown++;
  }
  return s;
}

export function compareReports(
  previous: { overallScore: number; dimensionScores: DimensionScoreDetail[] },
  current: { overallScore: number; dimensionScores: DimensionScoreDetail[] }
): ComparisonResult {
  const delta = current.overallScore - previous.overallScore;
  const dimensionDeltas: Partial<Record<QualityDimension, number>> = {};
  const prevMap = new Map(previous.dimensionScores.map((d) => [d.dimension, d.score]));
  const narrative: string[] = [];

  for (const ds of current.dimensionScores) {
    const prevScore = prevMap.get(ds.dimension) ?? ds.score;
    const d = ds.score - prevScore;
    dimensionDeltas[ds.dimension] = d;
    if (Math.abs(d) >= 5) narrative.push(`${ds.dimension}: ${prevScore} → ${ds.score} (${d > 0 ? '+' : ''}${d})`);
  }

  return { previousScore: previous.overallScore, currentScore: current.overallScore, delta, dimensionDeltas, narrative };
}
