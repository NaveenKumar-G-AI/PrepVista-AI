import { Forecast } from '../types';
import { ExplanationInput } from './explanationService';

function humanizeToken(token: string): string {
  return token.toLowerCase().replace(/_/g, ' ');
}

/**
 * Builds the structured ExplanationInput from a Forecast, converting
 * internal codes (trajectory states, metric keys, risk types) into
 * short readable phrases. Centralized here so:
 *  (a) the AI layer and its deterministic fallback both receive
 *      sensible, non-jargon input (SS41 Student-Facing Language), and
 *  (b) this mapping lives in exactly one place instead of being
 *      copy-pasted into every route/script that calls explainForecast().
 */
export function buildExplanationInput(forecast: Forecast, targetScore: number | null = null): ExplanationInput {
  const strengths = forecast.evidence
    .filter((e) => e.contribution === 'POSITIVE')
    .map((e) => {
      if (e.metric === 'readiness_trajectory') return 'an improving readiness trend';
      if (e.metric.startsWith('simulation:')) {
        const skill = humanizeToken(e.metric.slice('simulation:'.length));
        return `strong ${skill} performance in realistic simulation`;
      }
      return humanizeToken(e.metric);
    });

  const risks = forecast.risks.map((r) => humanizeToken(r.type.replace(/_RISK$/, '')));

  return {
    readiness: forecast.predictedValue,
    target: targetScore,
    trajectory: forecast.trajectory,
    confidence: forecast.confidence,
    risks,
    strengths,
    bottleneck: forecast.bottlenecks.primary?.skill ?? null,
  };
}
